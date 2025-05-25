import * as path from 'path';

let BASE_PATH: string;
const vscodeCwd = process.env.VSCODE_CWD;

if (vscodeCwd && (vscodeCwd === '/' || vscodeCwd.toLowerCase() === 'c:\\')) {
  throw new Error('VSCODE_CWD is set to a root directory. Please run Trae in the project directory with "trae ." to set VSCODE_CWD correctly.');
} else if (vscodeCwd) {
  BASE_PATH = vscodeCwd;
} else {
  BASE_PATH = process.cwd();
}

export { BASE_PATH };