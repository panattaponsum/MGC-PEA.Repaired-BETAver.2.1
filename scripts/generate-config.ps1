$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
$templatePath = Join-Path $projectRoot 'config.template.js'
$outputPath = Join-Path $projectRoot 'config.js'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "ไม่พบไฟล์ .env กรุณาคัดลอก .env.example เป็น .env แล้วกรอกค่า Firebase ก่อน"
}

$values = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $parts = $line -split '=', 2
        $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
}

$required = @(
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID',
    'FIREBASE_MEASUREMENT_ID'
)

$missing = @($required | Where-Object { -not $values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($values[$_]) })
if ($missing.Count -gt 0) {
    throw "กรุณากรอกค่าเหล่านี้ใน .env ก่อน: $($missing -join ', ')"
}

$config = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
$tokens = @{
    '__FIREBASE_API_KEY__' = $values['FIREBASE_API_KEY']
    '__FIREBASE_AUTH_DOMAIN__' = $values['FIREBASE_AUTH_DOMAIN']
    '__FIREBASE_PROJECT_ID__' = $values['FIREBASE_PROJECT_ID']
    '__FIREBASE_STORAGE_BUCKET__' = $values['FIREBASE_STORAGE_BUCKET']
    '__FIREBASE_MESSAGING_SENDER_ID__' = $values['FIREBASE_MESSAGING_SENDER_ID']
    '__FIREBASE_APP_ID__' = $values['FIREBASE_APP_ID']
    '__FIREBASE_MEASUREMENT_ID__' = $values['FIREBASE_MEASUREMENT_ID']
}

foreach ($token in $tokens.Keys) {
    $config = $config.Replace($token, $tokens[$token])
}

[System.IO.File]::WriteAllText($outputPath, $config, [System.Text.UTF8Encoding]::new($false))
Write-Host 'สร้าง config.js แล้ว รีโหลดหน้าเว็บใน Live Server ได้เลย'
