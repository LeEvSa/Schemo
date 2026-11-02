; Ajouts à l'installateur (repris par electron-builder) : une case décochée au dernier écran pour le raccourci sur le Bureau.
; createDesktopShortcut reste à false dans package.json : le raccourci n'existe que si la case est cochée.

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    LangString desktopShortcut ${LANG_ENGLISH} "Create a desktop shortcut"
    LangString desktopShortcut ${LANG_FRENCH} "Créer un raccourci sur le Bureau"
  !endif
!macroend

!macro customFinishPage
  ; même lancement que la page de fin d'origine (assistedInstaller.nsh)
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function createDesktopLink
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "$(desktopShortcut)"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "createDesktopLink"
  !insertmacro MUI_PAGE_FINISH
!macroend

; le raccourci ne vient plus d'electron-builder : c'est à nous de l'enlever à la désinstallation (pas lors d'une mise à jour)
!macro customUnInstall
  ${ifNot} ${isKeepShortcuts}
    WinShell::UninstShortcut "$oldDesktopLink"
    Delete "$oldDesktopLink"
  ${endIf}
!macroend
