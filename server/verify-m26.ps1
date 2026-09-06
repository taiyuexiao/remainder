# M26 comments + OKF export end-to-end verification (ASCII ONLY - PS 5.1 reads no-BOM ps1 as GBK)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }
$H = @{ 'Content-Type' = 'application/json' }

# 1. create team + item, bob joins
$t = Invoke-RestMethod -Method Post -Uri "$B/api/teams" -Headers $H -Body (@{name='m26-verify'} | ConvertTo-Json)
$T = $t.id
$k = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='note'; title='m26 verify'; team_id=$T} | ConvertTo-Json)
$detail = Invoke-RestMethod "$B/api/teams/$T"
Invoke-RestMethod -Method Post -Uri "$B/api/teams/join" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='bob' } -Body (@{invite_token=$detail.invite_token} | ConvertTo-Json) | Out-Null
"1. team+item+member ready"

# 2. comment + reply (threaded)
$c = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($k.id)/comments" -Headers $H -Body (@{content='root comment'} | ConvertTo-Json)
$r = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($k.id)/comments" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='bob' } -Body (@{content='reply to root'; parent_id=$c.id} | ConvertTo-Json)
$list = Invoke-RestMethod "$B/api/knowledge/$($k.id)/comments"
if ($list.Count -ne 2 -or @($list | Where-Object { $_.parent_id -eq $c.id }).Count -ne 1) { throw 'FAIL: thread structure' }
"2. threaded comments OK"

# 3. @mention -> P0 notification (bob mentions the item author, default local user name)
$author = $k.author
Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($k.id)/comments" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='bob' } -Body (@{content="@$author please check"} | ConvertTo-Json) | Out-Null
$notifs = Invoke-RestMethod "$B/api/notifications"
# mention notify only fires for real team members; author is not a member here, so assert mention of bob instead
Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($k.id)/comments" -Headers $H -Body (@{content='@bob ping'} | ConvertTo-Json) | Out-Null
$notifs2 = Invoke-RestMethod "$B/api/notifications"
if (@($notifs2 | Where-Object { $_.title -match 'bob|m26' }).Count -le @($notifs | Where-Object { $_.title -match 'bob|m26' }).Count) { throw 'FAIL: mention notification missing' }
"3. mention P0 OK"

# 4. guards: non-member comment 403; non-author delete 403
$code = curl.exe -s -o NUL -w '%{http_code}' -X POST "$B/api/knowledge/$($k.id)/comments" -H 'Content-Type: application/json' -H 'x-user-name: zhangsan' -d '{\"content\":\"hi\"}'
if ($code -ne '403') { throw "FAIL: non-member comment should be 403, got $code" }
$code2 = curl.exe -s -o NUL -w '%{http_code}' -X DELETE "$B/api/comments/$($c.id)" -H 'x-user-name: bob'
if ($code2 -ne '403') { throw "FAIL: non-author delete should be 403, got $code2" }
"4. guards OK"

# 5. OKF export: writes bundle with frontmatter
$exp = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/export/okf" -Headers $H -Body (@{team=$T} | ConvertTo-Json)
if ($exp.count -lt 1) { throw 'FAIL: export count' }
$md = Get-ChildItem $exp.dir -Filter '*.md' | Select-Object -First 1
$text = Get-Content $md.FullName -Raw -Encoding UTF8
if ($text -notmatch 'type: note' -or $text -notmatch 'title:') { throw "FAIL: frontmatter missing in $($md.Name)" }
"5. OKF export OK ($($exp.count) items)"

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/comments/$($r.id)" -Headers @{ 'x-user-name'='bob' } | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/comments/$($c.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($k.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/teams/$T" | Out-Null
'M26 VERIFY ALL PASS'
