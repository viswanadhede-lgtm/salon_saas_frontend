const fs = require('fs');
let content = fs.readFileSync('c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/sales-history.html', 'utf8');

const regex1 = /<i data-feather="user"><\/i>\s*<!-- Section Title Bar \(Sales History\) -->\s*<div class="tb-page-header"/;

const rep1 = `<i data-feather="user"></i>
                                    <span>Profile</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="calendar"></i>
                                    <span>Schedule</span>
                                </a>
                            </li>
                            <li id="billingMenuItem">
                                <a href="#" class="dropdown-item">
                                    <i data-feather="credit-card"></i>
                                    <span>Billing</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="settings"></i>
                                    <span>Settings</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item">
                                    <i data-feather="help-circle"></i>
                                    <span>Support</span>
                                </a>
                            </li>
                            <li>
                                <a href="#" class="dropdown-item text-danger">
                                    <i data-feather="log-out"></i>
                                    <span>Logout</span>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </header>

        <!-- Profile Dropdown Backdrop -->
        <div id="profileBackdrop" class="profile-backdrop"></div>

        <!-- Page Content -->
        <main class="content-area">

              <!-- Section Title Bar (Sales History) -->
        <div class="tb-page-header"`;

content = content.replace(regex1, rep1);

const regex2 = /<script src="sales-history\.js"><\/script>/;
const rep2 = `</main>
    </div>
    
    <script src="sales-history.js"></script>`;

content = content.replace(regex2, rep2);

fs.writeFileSync('c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/sales-history.html', content);
console.log('Fixed structure successfully.');
