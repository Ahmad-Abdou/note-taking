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

; When electron-updater runs NSIS in silent mode (/S), there is no finish page
; and users may not see any UI. Ensure the app is relaunched after a silent update.
!macro customInstall
  IfSilent 0 +2
    ExecShell "" "$INSTDIR\\Productivity Hub.exe"
!macroend
