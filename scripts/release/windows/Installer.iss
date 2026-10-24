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
Source: "{#PayloadRoot}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[InstallDelete]
Type: files; Name: "{userprograms}\BOFT.lnk"
Type: files; Name: "{userprograms}\BOFT console.lnk"

[Icons]
Name: "{userprograms}\BOFT CLI"; Filename: "{app}\bin\boft-start.exe"; WorkingDir: "{app}"
Name: "{userprograms}\BOFT CLI console"; Filename: "{app}\bin\boft-start.exe"; Parameters: "--console"; WorkingDir: "{app}"

[Dirs]
Name: "{app}"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
