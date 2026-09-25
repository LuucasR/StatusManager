# Levanta todo local: la base (copia de prod en el puerto 5433), el backend y el frontend.
#   Uso: click derecho > "Ejecutar con PowerShell", o en una terminal:  .\dev-local.ps1
#   Para cerrar: cerrá las dos ventanas que abre. La base queda corriendo; se apaga con
#   .\dev-local.ps1 -Stop
param([switch]$Stop)

$pg = "C:\Program Files\PostgreSQL\18\bin"
$data = "C:\Users\Lucas\StatusManager-localdb"
$root = $PSScriptRoot

if ($Stop) {
    & "$pg\pg_ctl.exe" -D $data stop
    return
}

# El backend tiene que apuntar a la base local, nunca a Neon/Supabase.
if (-not (Select-String -Path "$root\backend\.env" -Pattern '^DATABASE_URL=.*localhost:5433' -Quiet)) {
    Write-Host "backend\.env no apunta a la base local (localhost:5433). No arranco." -ForegroundColor Red
    return
}

& "$pg\pg_ctl.exe" -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Arrancando la base local..."
    Start-Process -FilePath "$pg\pg_ctl.exe" -WindowStyle Hidden -ArgumentList @(
        "-D", "`"$data`"", "-o", "`"-p 5433 -c listen_addresses=localhost`"", "-l", "`"$data\server.log`"", "start"
    )
    Start-Sleep -Seconds 3
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Listo. Abri http://localhost:5173 (tarda unos segundos en arrancar)." -ForegroundColor Green
Write-Host "Todas las cuentas locales tienen la clave: prueba1234"
