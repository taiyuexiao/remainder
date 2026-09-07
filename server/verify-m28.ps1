# M28 agent MCP enhancements verification (ASCII ONLY - PS 5.1 reads no-BOM ps1 as GBK)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }
$H = @{ 'Content-Type' = 'application/json' }

# 1. seed: spec + adr(with veto conclusion) + draft
$s = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='spec'; title='m28 order api contract'; content='order api'; owners=@('alice')} | ConvertTo-Json)
$a = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='adr'; title='m28 order orm decision'; content='use mybatis-plus'; owners=@('alice','bob')} | ConvertTo-Json)
$d = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='note'; title='m28 agent draft'; content='pitfall x'; status='draft'; author='agent-bot'} | ConvertTo-Json)
"1. seeded spec/adr/draft"

# 2. constraints: module=order returns adr first then spec
$cs = Invoke-RestMethod "$B/api/knowledge/constraints?team=personal&module=m28"
if ($cs.Count -lt 2) { throw 'FAIL: constraints count' }
if ($cs[0].type -ne 'adr') { throw 'FAIL: adr should come first' }
"2. constraints OK ($($cs.Count) hits, first=$($cs[0].type))"

# 3. who-knows: alice top (owner of 2, author 0)
$wk = Invoke-RestMethod "$B/api/knowledge/who-knows?team=personal&topic=m28"
$alice = @($wk | Where-Object { $_.name -eq 'alice' })[0]
if (-not $alice -or $alice.as_owner_count -lt 2) { throw 'FAIL: who-knows alice' }
if ($wk[0].name -ne 'alice') { throw 'FAIL: alice should rank first' }
"3. who-knows OK (top=$($wk[0].name) owner=$($alice.as_owner_count))"

# 4. draft visible in default list with draft status; not counted as active-only via status param
$list = Invoke-RestMethod "$B/api/knowledge?team=personal&includeExpired=1"
$draft = @($list | Where-Object { $_.id -eq $d.id })[0]
if (-not $draft -or $draft.status -ne 'draft') { throw 'FAIL: draft should appear in list' }
"4. draft listed OK"

# 5. confirm draft -> active
$conf = Invoke-RestMethod -Method Patch -Uri "$B/api/knowledge/$($d.id)" -Headers $H -Body (@{status='active'} | ConvertTo-Json)
if ($conf.status -ne 'active') { throw 'FAIL: confirm draft' }
"5. draft confirmed -> active"

# 6. MCP tools handshake: tools/list contains the 3 new tools
$mpcsvr = Join-Path $PSScriptRoot 'mcp-server\index.mjs'
$req = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' + "`n" + '{"jsonrpc":"2.0","method":"notifications/initialized"}' + "`n" + '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' + "`n"
$out = $req | node $mpcsvr 2>$null | Out-String
foreach ($t in @('kb_constraints','kb_who_knows','kb_submit_draft','kb_search','kb_get','kb_list_recent')) {
  if ($out -notmatch $t) { throw "FAIL: MCP tool missing: $t" }
}
"6. MCP tools/list OK (6 tools)"

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($s.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($a.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($d.id)" | Out-Null
'M28 VERIFY ALL PASS'
