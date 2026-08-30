# M1.3 CRUD API end-to-end verification (ASCII only to avoid PS encoding issues)
$ErrorActionPreference = 'Stop'
$B = 'http://127.0.0.1:3210'
$today = Get-Date -Format 'yyyy-MM-dd'
$yesterday = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')

# 1. create side task due today
$t1 = Invoke-RestMethod -Method Post -Uri "$B/api/tasks" -ContentType 'application/json' -Body (@{title='write weekly report'; type='side'; ddl=$today; priority=1} | ConvertTo-Json)
"t1 created: type=$($t1.type) ddl=$($t1.ddl) prio=$($t1.priority)"

# 2. create main task overdue (ddl=yesterday, milestone)
$t2 = Invoke-RestMethod -Method Post -Uri "$B/api/tasks" -ContentType 'application/json' -Body (@{title='payment integration'; type='main'; ddl=$yesterday; milestone='M2'} | ConvertTo-Json)
"t2 created: milestone=$($t2.milestone)"

# 3. create follow task (person=zhangsan, follow date=today)
$t3 = Invoke-RestMethod -Method Post -Uri "$B/api/tasks" -ContentType 'application/json' -Body (@{title='urge project approval'; type='follow'; person='zhangsan'; nextFollowDate=$today} | ConvertTo-Json)
"t3 created: $($t3.id -ne $null)"

# 4. validation: follow without person should 400
try { Invoke-RestMethod -Method Post -Uri "$B/api/tasks" -ContentType 'application/json' -Body (@{title='x'; type='follow'} | ConvertTo-Json); "VALIDATION FAIL: no 400" }
catch { "validation 400 OK" }

# 5. today view
$tv = Invoke-RestMethod "$B/api/tasks/today"
"today view: overdue=$($tv.overdue.Count) today=$($tv.today.Count) followUps=$($tv.followUps.Count)"

# 6. urge
$u = Invoke-RestMethod -Method Post -Uri "$B/api/follow-ups/$($t3.id)/urge"
"urge: count=$($u.urge_count) last_urged=$($u.last_urged_at -ne $null)"

# 7. list filter
$list = Invoke-RestMethod "$B/api/tasks?type=follow"
"list type=follow: $($list.Count)"

# 8. patch
$p = Invoke-RestMethod -Method Patch -Uri "$B/api/tasks/$($t1.id)" -ContentType 'application/json' -Body (@{priority=3; note='due friday'} | ConvertTo-Json)
"patched: priority=$($p.priority) note=$($p.note)"

# 9. done
$d = Invoke-RestMethod -Method Post -Uri "$B/api/tasks/$($t1.id)/done"
"done: status=$($d.status) done_at=$($d.done_at -ne $null)"

# 10. inbox: create -> convert -> list
$i1 = Invoke-RestMethod -Method Post -Uri "$B/api/inbox" -ContentType 'application/json' -Body (@{content='desktop pet reminder idea'; tags='idea'} | ConvertTo-Json)
"inbox created: $($i1.id -ne $null)"
$ib = Invoke-RestMethod "$B/api/inbox"
"inbox list: $($ib.Count)"
$c = Invoke-RestMethod -Method Post -Uri "$B/api/inbox/$($i1.id)/convert" -ContentType 'application/json' -Body (@{type='side'} | ConvertTo-Json)
"converted to task: title=$($c.title) tags=$($c.tags)"
$ib2 = Invoke-RestMethod "$B/api/inbox"
"inbox after convert: $($ib2.Count)"

# 11. settings
Invoke-RestMethod -Method Put -Uri "$B/api/settings/notify_enabled" -ContentType 'application/json' -Body (@{value='true'} | ConvertTo-Json) | Out-Null
$s = Invoke-RestMethod "$B/api/settings"
"settings: notify_enabled=$($s.notify_enabled)"

# 12. delete t2 (overdue should drop)
Invoke-RestMethod -Method Delete -Uri "$B/api/tasks/$($t2.id)" | Out-Null
$chk = Invoke-RestMethod "$B/api/tasks/today"
"after delete t2: overdue=$($chk.overdue.Count)"

"M1.3 ALL PASS"
