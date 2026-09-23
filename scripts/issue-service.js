import { supabase } from '../lib/supabase.js';

/**
 * Get authenticated application context
 */
export function getIssueContext() {
    const appContext = JSON.parse(localStorage.getItem('appContext') || '{}');
    const user = appContext.user || {};
    const company = appContext.company || {};
    const userId = user.user_id || null;
    const companyId = company.company_id || localStorage.getItem('company_id') || null;
    const branchId = appContext.current_branch_id || localStorage.getItem('active_branch_id') || null;
    const userName = user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Customer');
    const userAvatar = user.profile_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=1E3A8A&color=fff`;

    return { userId, companyId, branchId, userName, userAvatar };
}

/**
 * Submit a new issue report
 */
export async function submitIssue({ category, subject, description, file }) {
    const { userId, companyId, branchId } = getIssueContext();

    if (!userId || !companyId) {
        throw new Error('User or company context not found. Please ensure you are logged in.');
    }

    // 1. Insert into public.issues
    // Note: The database trigger create_initial_issue_message_after_insert creates the initial message automatically
    const { data: issue, error: issueErr } = await supabase
        .from('issues')
        .insert({
            user_id: userId,
            company_id: companyId,
            branch_id: branchId,
            category: category,
            subject: subject.trim(),
            description: description.trim(),
            status: 'open'
        })
        .select('id, reference_number, status, created_at')
        .single();

    if (issueErr || !issue) {
        console.error('[issue-service] Error creating issue:', issueErr);
        throw new Error(issueErr?.message || 'Failed to submit issue.');
    }

    let attachmentSaved = false;
    let attachmentError = null;

    // 2. Upload attachment if provided
    if (file) {
        try {
            // Find the trigger-created initial customer message
            const { data: initialMsg, error: msgErr } = await supabase
                .from('issue_messages')
                .select('id')
                .eq('issue_id', issue.id)
                .eq('sender_type', 'customer')
                .order('created_at', { ascending: true })
                .limit(1)
                .single();

            if (msgErr || !initialMsg) {
                console.warn('[issue-service] Could not find initial message for attachment:', msgErr);
                attachmentError = 'Initial message ID not found for attachment.';
            } else {
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `${companyId}/${issue.id}/${initialMsg.id}/${Date.now()}_${cleanFileName}`;

                const { error: uploadErr } = await supabase.storage
                    .from('issue-attachments')
                    .upload(storagePath, file);

                if (uploadErr) {
                    console.error('[issue-service] Storage upload failed:', uploadErr);
                    attachmentError = uploadErr.message;
                } else {
                    const { error: attErr } = await supabase
                        .from('issue_attachments')
                        .insert({
                            issue_id: issue.id,
                            message_id: initialMsg.id,
                            storage_path: storagePath,
                            file_name: file.name,
                            content_type: file.type || 'application/octet-stream',
                            size_bytes: file.size
                        });

                    if (attErr) {
                        console.error('[issue-service] Attachment record insert failed:', attErr);
                        attachmentError = attErr.message;
                    } else {
                        attachmentSaved = true;
                    }
                }
            }
        } catch (attEx) {
            console.error('[issue-service] Attachment upload exception:', attEx);
            attachmentError = attEx.message;
        }
    }

    return {
        issue,
        referenceNumber: issue.reference_number,
        attachmentSaved,
        attachmentError
    };
}

/**
 * Fetch issues for the current customer's company
 */
export async function getIssues() {
    const { companyId } = getIssueContext();
    if (!companyId) {
        return { data: [], error: new Error('Company context not found.') };
    }

    const { data, error } = await supabase
        .from('issues')
        .select('id, reference_number, category, subject, description, status, created_at, updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    return { data: data || [], error };
}

/**
 * Fetch thread messages and attachments for an issue
 */
export async function getIssueThread(issueId) {
    if (!issueId) return { messages: [], allAttachments: [] };

    const [msgRes, attRes] = await Promise.all([
        supabase
            .from('issue_messages')
            .select('id, issue_id, sender_type, sender_user_id, sender_name, message, created_at')
            .eq('issue_id', issueId)
            .order('created_at', { ascending: true }),
        supabase
            .from('issue_attachments')
            .select('id, issue_id, message_id, storage_path, file_name, content_type, size_bytes, created_at')
            .eq('issue_id', issueId)
            .order('created_at', { ascending: true })
    ]);

    const messages = msgRes.data || [];
    const attachments = attRes.data || [];

    // Resolve URLs for attachments
    const attachmentsWithUrls = await Promise.all(attachments.map(async (att) => {
        let fileUrl = '#';
        try {
            const { data: signData } = await supabase.storage.from('issue-attachments').createSignedUrl(att.storage_path, 3600);
            if (signData?.signedUrl) {
                fileUrl = signData.signedUrl;
            } else {
                const { data: pubData } = supabase.storage.from('issue-attachments').getPublicUrl(att.storage_path);
                fileUrl = pubData?.publicUrl || '#';
            }
        } catch {
            const { data: pubData } = supabase.storage.from('issue-attachments').getPublicUrl(att.storage_path);
            fileUrl = pubData?.publicUrl || '#';
        }
        return { ...att, url: fileUrl };
    }));

    // Group attachments by message_id
    const attachmentsByMsgId = {};
    attachmentsWithUrls.forEach(att => {
        if (!attachmentsByMsgId[att.message_id]) {
            attachmentsByMsgId[att.message_id] = [];
        }
        attachmentsByMsgId[att.message_id].push(att);
    });

    const threadMessages = messages.map(m => ({
        ...m,
        attachments: attachmentsByMsgId[m.id] || []
    }));

    return {
        messages: threadMessages,
        allAttachments: attachmentsWithUrls
    };
}

/**
 * Send a follow-up reply to an issue
 */
export async function sendFollowUp({ issueId, message, file }) {
    const { userId, companyId, userName } = getIssueContext();
    if (!userId) throw new Error('User not authenticated.');

    const trimmedMsg = (message || '').trim() || (file ? `Attached file: ${file.name}` : '');
    if (!trimmedMsg) throw new Error('Message cannot be empty.');

    const { data: newMsg, error: msgErr } = await supabase
        .from('issue_messages')
        .insert({
            issue_id: issueId,
            sender_type: 'customer',
            sender_user_id: userId,
            sender_name: userName,
            message: trimmedMsg
        })
        .select('id, issue_id, sender_type, sender_user_id, sender_name, message, created_at')
        .single();

    if (msgErr || !newMsg) {
        throw new Error(msgErr?.message || 'Failed to send message.');
    }

    let attachment = null;
    if (file) {
        try {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `${companyId}/${issueId}/${newMsg.id}/${Date.now()}_${cleanFileName}`;

            const { error: uploadErr } = await supabase.storage
                .from('issue-attachments')
                .upload(storagePath, file);

            if (!uploadErr) {
                const { data: attData } = await supabase
                    .from('issue_attachments')
                    .insert({
                        issue_id: issueId,
                        message_id: newMsg.id,
                        storage_path: storagePath,
                        file_name: file.name,
                        content_type: file.type || 'application/octet-stream',
                        size_bytes: file.size
                    })
                    .select()
                    .single();

                if (attData) {
                    let fileUrl = '#';
                    try {
                        const { data: signData } = await supabase.storage.from('issue-attachments').createSignedUrl(storagePath, 3600);
                        fileUrl = signData?.signedUrl || supabase.storage.from('issue-attachments').getPublicUrl(storagePath).data?.publicUrl || '#';
                    } catch {
                        fileUrl = supabase.storage.from('issue-attachments').getPublicUrl(storagePath).data?.publicUrl || '#';
                    }
                    attachment = { ...attData, url: fileUrl };
                }
            } else {
                console.error('[issue-service] Attachment upload error:', uploadErr);
            }
        } catch (e) {
            console.error('[issue-service] Follow-up attachment error:', e);
        }
    }

    return {
        message: {
            ...newMsg,
            attachments: attachment ? [attachment] : []
        }
    };
}

/**
 * Update issue status (e.g. 'resolved' or 'open')
 */
export async function updateIssueStatus(issueId, status) {
    // Valid DB check values: 'open', 'in_progress', 'resolved', 'closed'
    const normalized = status.toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await supabase
        .from('issues')
        .update({ status: normalized })
        .eq('id', issueId)
        .select('id, status, updated_at')
        .single();

    if (error) throw error;
    return data;
}
