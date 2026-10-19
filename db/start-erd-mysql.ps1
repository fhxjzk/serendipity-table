# Starts a throwaway MySQL 8.0 for eXERD reverse engineering and loads the 44-table schema.
# Credentials live in exerd-local.env next to this script (never commit it).
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$envFile = Join-Path $here 'exerd-local.env'
$sql = Join-Path (Split-Path $here) 'docs\sql\schema_mysql_for_exerd.sql'
$name = 'usangtak-erd-mysql'

if (-not (Test-Path $envFile)) { throw "missing $envFile" }
docker version --format '{{.Server.Version}}' | Out-Null

docker rm -f $name 2>$null | Out-Null
docker run -d --name $name -p 127.0.0.1:3306:3306 --env-file $envFile mysql:8.0 `
  --default-authentication-plugin=mysql_native_password `
  --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci | Out-Null

# In-container commands live in load-schema.sh: PowerShell 5.1 strips quotes inside `sh -c '...'`.
docker cp (Join-Path $here 'load-schema.sh') "${name}:/tmp/load-schema.sh"
docker exec $name sed -i 's/\r$//' /tmp/load-schema.sh

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker exec $name sh /tmp/load-schema.sh ping 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 3
}
if (-not $ready) { throw 'MySQL did not become ready' }

docker cp $sql "${name}:/tmp/schema.sql"
docker exec $name sh /tmp/load-schema.sh load
$counts = (docker exec $name sh /tmp/load-schema.sh count) -split '\s+'

Write-Host "tables: $($counts[0]), foreign keys: $($counts[1])"
Write-Host 'eXERD connection: host localhost, port 3306, database usangtak_erd, user exerd (password: MYSQL_PASSWORD in db\exerd-local.env)'
