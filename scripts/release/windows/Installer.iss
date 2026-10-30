[Setup]
AppId={{8A7B4E80-A650-4D47-9D05-8D4D7F13E67E}
AppName=BOFT CLI
AppVersion={#ProductVersion}
AppPublisher=LiberSeek
DefaultDirName={localappdata}\Programs\boft
DefaultGroupName=BOFT CLI
DisableProgramGroupPage=yes
UsePreviousAppDir=no
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=BOFT CLI
SetupIconFile=..\..\..\crates\launcher\assets\codexhost.ico
UninstallDisplayIcon={app}\bin\boft-start.exe

#if Architecture == "x64"
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#else
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#endif

[Files]
; Extract the new helper before touching an existing installation, including older versions.
Source: "{#PayloadRoot}\libexec\boft-updater.exe"; DestName: "boft-install-helper.exe"; Flags: dontcopy
Source: "{#PayloadRoot}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[InstallDelete]
Type: files; Name: "{userprograms}\BOFT.lnk"
Type: files; Name: "{userprograms}\BOFT console.lnk"

[Icons]
Name: "{userdesktop}\BOFT CLI"; Filename: "{app}\bin\boft-start.exe"; WorkingDir: "{app}"
Name: "{userprograms}\BOFT CLI"; Filename: "{app}\bin\boft-start.exe"; WorkingDir: "{app}"
Name: "{userprograms}\BOFT CLI console"; Filename: "{app}\bin\boft-start.exe"; Parameters: "--console"; WorkingDir: "{app}"

[Dirs]
Name: "{app}"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  try
    ExtractTemporaryFile('boft-install-helper.exe');
    { PrepareToInstall runs after Install is clicked, before the file-in-use check.
      Append a dot so even a drive-root destination has no trailing argument backslash. }
    if not ExecAndLogOutput(
      ExpandConstant('{tmp}\boft-install-helper.exe'),
      'prepare-install --install-root ' + AddQuotes(AddBackslash(ExpandConstant('{app}')) + '.'),
      ExpandConstant('{tmp}'), SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode, nil) then
      Result := 'Could not start BOFT CLI installation preparation: ' + SysErrorMessage(ResultCode)
    else if ResultCode <> 0 then begin
      Log(Format('BOFT CLI installation preparation failed with exit code %d', [ResultCode]));
      Result := 'Could not close BOFT CLI. Close it and try again.';
    end;
  except
    Result := 'Could not prepare BOFT CLI installation: ' + GetExceptionMessage;
  end;
end;
