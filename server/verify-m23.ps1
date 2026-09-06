# M23 knowledge base end-to-end verification (ASCII only to avoid PS encoding issues)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }

# 1. create note (default TTL 180d)
$n = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -ContentType 'application/json' -Body (@{type='note'; title='m23 verify note'; content='x'; channels=@('backend'); tags=@('m23')} | ConvertTo-Json)
"1. note created: $($n.type) expires=$($n.expires_at.Substring(0,10))"

# 2. create intel (default TTL 14d)
$i = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -ContentType 'application/json' -Body (@{type='intel'; title='m23 verify intel'} | ConvertTo-Json)
"2. intel expires=$($i.expires_at.Substring(0,10))"

# 3. create rfc, conclude + promote to adr
$r = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -ContentType 'application/json' -Body (@{type='rfc'; title='m23 verify rfc'; content='要不要统一异常处理'} | ConvertTo-Json)
if ($r.status -ne 'open') { throw 'FAIL: rfc status should be open' }
$c = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($r.id)/conclude" -ContentType 'application/json' -Body (@{conclusion='统一用 BusinessException'; promoteTo='adr'} | ConvertTo-Json)
if ($c.concluded.status -ne 'concluded') { throw 'FAIL: not concluded' }
if (-not $c.promoted -or $c.promoted.type -ne 'adr') { throw 'FAIL: promote to adr failed' }
"3. rfc concluded + promoted to adr: $($c.promoted.id)"

# 4. search (FTS)
$q4 = [uri]::EscapeDataString('verify note')
$s = Invoke-RestMethod "$B/api/knowledge?q=$q4"
"4. search hits: $($s.Count)"

# 5. channel filter
$f = Invoke-RestMethod "$B/api/knowledge?channel=backend"
if (($f | Where-Object { $_.id -eq $n.id }).Count -eq 0) { throw 'FAIL: channel filter' }
"5. channel filter OK"

# 6. useful +1
$u = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($n.id)/useful"
"6. useful_count=$($u.useful_count)"

# 7. expired hidden by default: create already-expired intel, list should not contain it
$exp = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -ContentType 'application/json' -Body (@{type='intel'; title='m23 expired'; ttl='2020-01-01'} | ConvertTo-Json)
$list = Invoke-RestMethod "$B/api/knowledge?type=intel"
if (($list | Where-Object { $_.id -eq $exp.id }).Count -gt 0) { throw 'FAIL: expired item should be hidden' }
$listAll = Invoke-RestMethod "$B/api/knowledge?type=intel&includeExpired=1"
if (($listAll | Where-Object { $_.id -eq $exp.id }).Count -eq 0) { throw 'FAIL: includeExpired should show it' }
"7. TTL sink OK"

# 8. token auth on non-loopback (separate instance PORT=3212 HOST=0.0.0.0 TEAM_TOKEN)
$env:HOST='0.0.0.0'; $env:PORT='3212'; $env:TEAM_TOKEN='m23-token'
$proc = Start-Process -FilePath 'node' -ArgumentList 'dist\index.js' -WorkingDirectory "$PSScriptRoot" -PassThru -WindowStyle Hidden
Start-Sleep 4
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
  $codeNoToken = curl.exe -s -o NUL -w '%{http_code}' --max-time 5 "http://${lanIp}:3212/api/health"
  $codeToken = curl.exe -s -o NUL -w '%{http_code}' --max-time 5 -H 'x-team-token: m23-token' "http://${lanIp}:3212/api/health"
  if ($codeNoToken -ne '401') { throw "FAIL: no-token should be 401, got $codeNoToken" }
  if ($codeToken -ne '200') { throw "FAIL: with-token should be 200, got $codeToken" }
  "8. team token auth OK (no-token=$codeNoToken, token=$codeToken)"
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($n.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($i.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($r.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($c.promoted.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($exp.id)" | Out-Null
'M23 VERIFY ALL PASS'
