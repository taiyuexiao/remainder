# M10.1 backend verify script (ASCII only)
# Full-chain check against http://127.0.0.1:3210
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3210'
$fail = 0
$script:createdProjectIds = @()
$script:createdTaskIds = @()

function Ok($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" }
  else { $script:fail++; Write-Host "FAIL  $name  -> $detail" }
}

function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$base$path"; TimeoutSec = 10 }
  if ($null -ne $body) { $p.ContentType = 'application/json'; $p.Body = ($body | ConvertTo-Json -Compress) }
  # PS5.1 quirk: Invoke-RestMethod may emit a JSON array as ONE pipeline object;
  # capture first, then return so callers always get a flat enumeration.
  $r = Invoke-RestMethod @p
  # function return enumerates arrays -> caller gets flat items; scalars pass through
  return $r
}

# ---- 0. health ----
$h = Api 'GET' '/api/health' $null
Ok 'health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)

$today = Get-Date -Format 'yyyy-MM-dd'
$yesterday = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')

# ---- 1. migration: old main/side/follow tasks became projects, follow data kept ----
$projects = @(Api 'GET' '/api/projects' $null)
Ok 'migration: projects exist (old tasks migrated)' ($projects.Count -ge 3) "count=$($projects.Count)"
$types = $projects | Group-Object type | ForEach-Object { "$($_.Name)=$($_.Count)" }
Write-Host "       migrated types: $($types -join ', ')"
$follows = @($projects | Where-Object { $_.type -eq 'follow' })
Ok 'migration: follow projects have person/next_follow_date' (($follows.Count -gt 0) -and ($follows[0].person)) ($follows | ConvertTo-Json -Compress)
$migrated = @($projects | Where-Object { $_.name -notlike 'M10V*' })
Ok 'migration: old M1.3 data present (id/name preserved)' ($migrated.Count -ge 3) "migrated=$($migrated.Count)"
Ok 'list: done_count/total_count fields present' ($null -ne $projects[0].done_count -and $null -ne $projects[0].total_count) 'missing count fields'

# ---- 2. project CRUD ----
$p1 = Api 'POST' '/api/projects' @{ name = 'M10V main proj'; type = 'main'; priority = 1; ddl = $today }
$script:createdProjectIds += $p1.id
Ok 'project create (main)' ($p1.id -and $p1.name -eq 'M10V main proj' -and $p1.status -eq 'todo') ($p1 | ConvertTo-Json -Compress)
$p1b = Api 'PATCH' "/api/projects/$($p1.id)" @{ note = 'patched-note'; milestone = 'M1' }
Ok 'project patch' ($p1b.note -eq 'patched-note' -and $p1b.milestone -eq 'M1') ($p1b | ConvertTo-Json -Compress)
$pDone = Api 'POST' "/api/projects/$($p1.id)/done" $null
Ok 'project done' ($pDone.status -eq 'done' -and $pDone.done_at) ($pDone | ConvertTo-Json -Compress)

# follow project: person + nextFollowDate required
$err400 = $false
try { Api 'POST' '/api/projects' @{ name = 'M10V bad follow'; type = 'follow' } | Out-Null } catch { $err400 = $true }
Ok 'follow project requires person+nextFollowDate (400)' $err400 'expected 400'
$pf = Api 'POST' '/api/projects' @{ name = 'M10V follow proj'; type = 'follow'; person = 'lisi'; nextFollowDate = $today }
$script:createdProjectIds += $pf.id
Ok 'follow project create' ($pf.person -eq 'lisi' -and $pf.next_follow_date -eq $today) ($pf | ConvertTo-Json -Compress)
$pfb = Api 'PATCH' "/api/projects/$($pf.id)" @{ nextFollowDate = $yesterday }
Ok 'follow upsert via PATCH' ($pfb.next_follow_date -eq $yesterday -and $pfb.person -eq 'lisi') ($pfb | ConvertTo-Json -Compress)

# ---- 3. subtask CRUD (POST /api/tasks with projectId) ----
$ps = Api 'POST' '/api/projects' @{ name = 'M10V side proj'; type = 'side' }
$script:createdProjectIds += $ps.id
$t1 = Api 'POST' '/api/tasks' @{ title = 'M10V sub today'; projectId = $ps.id; ddl = $today; priority = 1 }
$script:createdTaskIds += $t1.id
Ok 'subtask create inherits project type' ($t1.type -eq 'side' -and $t1.project_id -eq $ps.id -and $t1.project_name -eq 'M10V side proj') ($t1 | ConvertTo-Json -Compress)
$t2 = Api 'POST' '/api/tasks' @{ title = 'M10V sub overdue'; projectId = $ps.id; ddl = $yesterday }
$script:createdTaskIds += $t2.id
$t1b = Api 'PATCH' "/api/tasks/$($t1.id)" @{ note = 'subtask-note' }
Ok 'subtask patch' ($t1b.note -eq 'subtask-note') ($t1b | ConvertTo-Json -Compress)
$subList = @(Api 'GET' "/api/tasks?projectId=$($ps.id)" $null)
Ok 'subtask list by projectId' ($subList.Count -eq 2) "count=$($subList.Count)"
$noPid = $false
try { Api 'POST' '/api/tasks' @{ title = 'M10V bad task'; type = 'main' } | Out-Null } catch { $noPid = $true }
Ok 'task without projectId must be idea (400)' $noPid 'expected 400'
$idea = Api 'POST' '/api/tasks' @{ title = 'M10V flat idea'; type = 'idea' }
$script:createdTaskIds += $idea.id
Ok 'flat idea create (project_id null)' ($idea.type -eq 'idea' -and -not $idea.project_id) ($idea | ConvertTo-Json -Compress)

# ---- 4. today view: 3 sections + project_name ----
$tv = Api 'GET' '/api/tasks/today' $null
$tvToday = @($tv.today | Where-Object { $_.id -eq $t1.id })
Ok 'today view: today section has subtask + project_name' ($tvToday.Count -eq 1 -and $tvToday[0].project_name -eq 'M10V side proj') ($tvToday | ConvertTo-Json -Compress)
$tvOverdue = @($tv.overdue | Where-Object { $_.id -eq $t2.id })
Ok 'today view: overdue section has subtask + project_name' ($tvOverdue.Count -eq 1 -and $tvOverdue[0].project_name -eq 'M10V side proj') ($tvOverdue | ConvertTo-Json -Compress)
$tvFollow = @($tv.followUps | Where-Object { $_.id -eq $pf.id })
Ok 'today view: followUps section has follow project (title alias)' ($tvFollow.Count -eq 1 -and $tvFollow[0].title -eq 'M10V follow proj' -and $tvFollow[0].person -eq 'lisi') ($tvFollow | ConvertTo-Json -Compress)
$tvOld = @($tv.followUps | Where-Object { $_.person -eq 'zhangsan' })
Ok 'today view: migrated follow projects appear in followUps' ($tvOld.Count -ge 2) "count=$($tvOld.Count)"

# ---- 5. urge acts on project ----
$ur = Api 'POST' "/api/follow-ups/$($pf.id)/urge" $null
Ok 'urge on project: urge_count+1' ($ur.urge_count -eq 1 -and $ur.last_urged_at) ($ur | ConvertTo-Json -Compress)
$pfAfter = @(Api 'GET' '/api/projects' $null) | Where-Object { $_.id -eq $pf.id }
Ok 'project list reflects urge_count' ($pfAfter.urge_count -eq 1) ($pfAfter | ConvertTo-Json -Compress)

# ---- 6. delete project: subtasks fall to idea, project follow row cascade-deleted ----
$del = Api 'DELETE' "/api/projects/$($ps.id)" $null
Ok 'project delete returns id' ($del.deleted -eq $ps.id) ($del | ConvertTo-Json -Compress)
$script:createdProjectIds = @($script:createdProjectIds | Where-Object { $_ -ne $ps.id })
$t1After = Api 'GET' '/api/tasks?type=idea' $null | Where-Object { $_.id -eq $t1.id }
Ok 'subtask survives as idea (project_id null)' ($t1After -and $t1After.type -eq 'idea' -and -not $t1After.project_id) ($t1After | ConvertTo-Json -Compress)
$gone = $false
try { Api 'GET' "/api/projects/$($ps.id)" $null | Out-Null } catch { $gone = $true }
# no GET-by-id route; check absence via list instead
$stillThere = @(Api 'GET' '/api/projects?status=archived' $null) | Where-Object { $_.id -eq $ps.id }
Ok 'deleted project not in any list' ($stillThere.Count -eq 0) 'project still listed'

# ---- summary ----
Write-Host ''
if ($fail -eq 0) { Write-Host 'M10.1 ALL PASS' } else { Write-Host "M10.1 FAIL: $fail check(s) failed"; exit 1 }
