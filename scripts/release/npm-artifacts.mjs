export const NPM_PACKAGE_NAME = "@liberseek/boft-cli";
export const NPM_PLATFORM_PACKAGE_NAMES = Object.freeze({
  "macos-arm64": "@liberseek/boft-cli-darwin-arm64",
  "macos-x64": "@liberseek/boft-cli-darwin-x64",
  "windows-x64": "@liberseek/boft-cli-win32-x64",
  "windows-arm64": "@liberseek/boft-cli-win32-arm64",
  "linux-x64": "@liberseek/boft-cli-linux-x64",
  "linux-arm64": "@liberseek/boft-cli-linux-arm64",
});

export function npmPlatformPackageName(target) {
  const packageName = NPM_PLATFORM_PACKAGE_NAMES[target.id];
  if (!packageName) throw new Error(`unsupported npm package target: ${target.id}`);
  return packageName;
}

export function npmTarballFileName({ version, target }) {
  return `boft-cli-${version}-${target.id}.tgz`;
}

export function npmMetaTarballFileName(version) {
  return `boft-cli-${version}.tgz`;
}
