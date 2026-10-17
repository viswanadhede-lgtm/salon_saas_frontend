$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server running on http://localhost:$port"

$baseDir = (Get-Location).Path

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = "overview.html" }
        $filePath = Join-Path $baseDir $urlPath

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = "application/octet-stream"
            if ($ext -eq ".html") { $mime = "text/html" }
            elseif ($ext -eq ".css") { $mime = "text/css" }
            elseif ($ext -eq ".js") { $mime = "application/javascript" }
            elseif ($ext -eq ".json") { $mime = "application/json" }
            elseif ($ext -eq ".png") { $mime = "image/png" }
            elseif ($ext -eq ".svg") { $mime = "image/svg+xml" }

            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.OutputStream.Close()
    } catch {
        # ignore client disconnect
    }
}
