!include "LogicLib.nsh"
!include "WordFunc.nsh"
!include "x64.nsh"
!include "${BUILD_RESOURCES_DIR}\vcredist-version.nsh"
!define RUIZCACAO_VC_KEY "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"

!ifndef BUILD_UNINSTALLER
Var RuizRuntimeReady
Var RuizRuntimeResult
Var RuizRuntimeHandle
Var RuizRuntimeExit
Var RuizRuntimeVersion

; Ambas vistas se usan en instalaciones oficiales de VC++. Restituir la vista
; de electron-builder para conservar la identidad/ruta de versiones anteriores.
Function RuizCheckRuntime
  StrCpy $RuizRuntimeReady 0
  SetRegView 64
  ReadRegDWORD $0 HKLM "${RUIZCACAO_VC_KEY}" "Installed"
  ReadRegStr $RuizRuntimeVersion HKLM "${RUIZCACAO_VC_KEY}" "Version"
  Call RuizCompareRuntime
  ${If} $RuizRuntimeReady != 1
    SetRegView 32
    ReadRegDWORD $0 HKLM "${RUIZCACAO_VC_KEY}" "Installed"
    ReadRegStr $RuizRuntimeVersion HKLM "${RUIZCACAO_VC_KEY}" "Version"
    Call RuizCompareRuntime
  ${EndIf}
  SetRegView 64
  ; NSIS es x86: consultar solamente el System32 nativo del runtime x64.
  ${DisableX64FSRedirection}
  ${IfNot} ${FileExists} "$SYSDIR\VCRUNTIME140.dll"
    StrCpy $RuizRuntimeReady 0
  ${EndIf}
  ${IfNot} ${FileExists} "$SYSDIR\VCRUNTIME140_1.dll"
    StrCpy $RuizRuntimeReady 0
  ${EndIf}
  ${IfNot} ${FileExists} "$SYSDIR\MSVCP140.dll"
    StrCpy $RuizRuntimeReady 0
  ${EndIf}
  ${IfNot} ${FileExists} "$SYSDIR\CONCRT140.dll"
    StrCpy $RuizRuntimeReady 0
  ${EndIf}
  ${EnableX64FSRedirection}
FunctionEnd

Function RuizCompareRuntime
  ${If} $0 == 1
    StrCpy $1 $RuizRuntimeVersion 1
    ${If} $1 == "v"
      StrCpy $RuizRuntimeVersion $RuizRuntimeVersion "" 1
    ${EndIf}
    ${If} $RuizRuntimeVersion != ""
      ${VersionCompare} "$RuizRuntimeVersion" "${RUIZCACAO_VC_VERSION}" $1
      ${If} $1 != 2
        StrCpy $RuizRuntimeReady 1
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

; Solo identificadores/códigos del proceso, sin rutas ni salida de Microsoft.
Function RuizRuntimeLog
  ClearErrors
  CreateDirectory "$LOCALAPPDATA\RuizCacao Manager\logs"
  FileOpen $0 "$LOCALAPPDATA\RuizCacao Manager\logs\instalacion-runtime.jsonl" a
  IfErrors ruiz_log_end
  FileWrite $0 '{$\"modulo$\":$\"instalador$\",$\"operacion$\":$\"vcredist$\",$\"version$\":$\"${RUIZCACAO_VC_VERSION}$\",$\"resultado$\":$\"$RuizRuntimeResult$\",$\"codigo$\":$\"$RuizRuntimeExit$\"}$\r$\n'
  FileClose $0
  ruiz_log_end:
  ClearErrors
FunctionEnd

!macro customInit
  Call RuizCheckRuntime
  ${If} $RuizRuntimeReady != 1
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=VC_redist.x64.exe "${BUILD_RESOURCES_DIR}\..\vendor\vcredist\VC_redist.x64.exe"
    ; Solo este proceso requiere UAC. NSIS/app permanecen en el perfil original.
    ${StdUtils.ExecShellWaitEx} $RuizRuntimeResult $RuizRuntimeHandle "$PLUGINSDIR\VC_redist.x64.exe" "runas" "/install /quiet /norestart"
    ${If} $RuizRuntimeResult != "ok"
      StrCpy $RuizRuntimeExit $RuizRuntimeHandle
      Call RuizRuntimeLog
      MessageBox MB_OK|MB_ICONSTOP "No se pudo instalar un componente de Microsoft necesario para RuizCacao Manager. Vuelve a ejecutar el instalador y permite la autorización de Windows. Si el problema continúa, contacta con soporte." /SD IDOK
      SetErrorLevel 1603
      Quit
    ${EndIf}
    ${StdUtils.WaitForProcEx} $RuizRuntimeExit $RuizRuntimeHandle
    Call RuizRuntimeLog
    ${If} $RuizRuntimeExit == 3010
    ${OrIf} $RuizRuntimeExit == 1641
      ; No reemplazar la app anterior ni arrancar PostgreSQL antes del reinicio.
      MessageBox MB_OK|MB_ICONINFORMATION "El componente de Microsoft necesita reiniciar Windows. Reinicia el equipo y vuelve a ejecutar el instalador de RuizCacao Manager para completar la instalación." /SD IDOK
      SetErrorLevel 3010
      Quit
    ${EndIf}
    Call RuizCheckRuntime
    ${If} $RuizRuntimeReady != 1
      MessageBox MB_OK|MB_ICONSTOP "No se pudo preparar el componente de Microsoft necesario para RuizCacao Manager. Reinicia el equipo y vuelve a ejecutar el instalador. Si el problema continúa, contacta con soporte." /SD IDOK
      SetErrorLevel 1603
      Quit
    ${EndIf}
    ${If} $RuizRuntimeExit != 0
    ${AndIf} $RuizRuntimeExit != 1638
    ${AndIf} $RuizRuntimeExit != -2147023258
    ${AndIf} $RuizRuntimeExit != 2147944038
      ; 0x80070666: otro instalador pudo haber incorporado una versión posterior.
      MessageBox MB_OK|MB_ICONSTOP "La preparación del componente de Microsoft no se completó. Reinicia el equipo y vuelve a ejecutar el instalador. Si el problema continúa, contacta con soporte." /SD IDOK
      SetErrorLevel 1603
      Quit
    ${EndIf}
  ${EndIf}
!macroend
!endif
