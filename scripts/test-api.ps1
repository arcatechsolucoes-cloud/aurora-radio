# test_api.ps1 — bateria de testes do painel (rápida)
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000'

function Get-Json($url, $cookie) {
  if ($cookie) { curl.exe -s -b $cookie $url } else { curl.exe -s $url }
}

Set-Content login.json '{"username":"admin","password":"aurora2024"}'
curl.exe -s -c c_admin.txt -H "Content-Type: application/json" --data-binary "@login.json" "$base/api/login" | Out-Null

$dash = Get-Json "$base/api/dashboard" c_admin.txt | ConvertFrom-Json
Write-Output "dashboard: onAir=$($dash.onAir) listeners=$($dash.listeners) now=$($dash.nowPlaying.title)"
Write-Output "storage: $($dash.storage.usedBytes) bytes / $($dash.storage.trackCount) faixas"

$lv = Get-Json "$base/api/live/info" c_admin.txt | ConvertFrom-Json
Write-Output "live/info: $($lv.host):$($lv.port) mount=$($lv.mount) user=$($lv.user)"

$users = Get-Json "$base/api/users" c_admin.txt | ConvertFrom-Json
Write-Output "users: $(($users | ForEach-Object { $_.username }) -join ', ')"

$st = Get-Json "$base/api/stats/history" c_admin.txt | ConvertFrom-Json
Write-Output "stats kpis: pico=$($st.kpis.peakListeners) hoje=$($st.kpis.totalListenersToday) streams=$($st.kpis.streamsToday)"

$cfg = Get-Json "$base/api/settings" c_admin.txt | ConvertFrom-Json
Write-Output "settings: estacao=$($cfg.stationName) autodjPl=$($cfg.autodjPlaylistId)"

curl.exe -s --max-time 3 -o so.bin "$base/stream"
Write-Output "stream: $((Get-Item so.bin).Length) bytes"

Set-Content dj.json '{"username":"dj_marcos","password":"dj2024"}'
curl.exe -s -c c_dj.txt -H "Content-Type: application/json" --data-binary "@dj.json" "$base/api/login" | Out-Null
$code = curl.exe -s -o NUL -w "%{http_code}" -b c_dj.txt "$base/api/users"
Write-Output "locutor tentou users (403 esperado): $code"
$code2 = curl.exe -s -o NUL -w "%{http_code}" -b c_dj.txt "$base/api/dashboard"
Write-Output "locutor dashboard (200 esperado): $code2"

Remove-Item c_admin.txt, c_dj.txt, login.json, dj.json, so.bin -ErrorAction SilentlyContinue
Write-Output "FIM"