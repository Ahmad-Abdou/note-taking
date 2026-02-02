; Custom NSIS hooks for electron-builder
; Goal: ensure updates/install never prompt "Productivity Hub cannot be closed".
; We aggressively terminate the running app process before install/uninstall.

!macro customInit
  ; Best-effort kill (ignore failures if not running)
  nsExec::ExecToLog '"$SYSDIR\\taskkill.exe" /T /F /IM "Productivity Hub.exe"'
!macroend

!macro customUnInit
  nsExec::ExecToLog '"$SYSDIR\\taskkill.exe" /T /F /IM "Productivity Hub.exe"'
!macroend
