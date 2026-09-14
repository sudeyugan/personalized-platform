!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\一隅.lnk" "$INSTDIR\yiyu.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\一隅.lnk"
!macroend
