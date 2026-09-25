import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['desktop/main.cjs', ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error); process.exit(1); });
