; 首次安装时，目录页默认落到 D:\Agent Session Center，而不是当前用户的 AppData。
; 已经装过的机器仍沿用注册表里的原目录。命令行 /D= 优先于这个默认值。
; 向导里的目录页始终可以改成任意盘符。应用内自动更新会带 --updated，安装器会跳过目录页。

!macro customInit
  ${If} $hasPerUserInstallation == "0"
  ${AndIf} $hasPerMachineInstallation == "0"
    !insertmacro GetDParameter $R0
    ${If} $R0 == ""
      ; 3 = DRIVE_FIXED。空盘也能认出来，U 盘不当默认位置。
      StrCpy $0 "D:\"
      System::Call 'kernel32::GetDriveType(t r0) i .r1'
      ${If} $1 = 3
        StrCpy $INSTDIR "D:\Agent Session Center"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
