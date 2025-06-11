// File: extension.js
const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

let useJJ = false;

function isJJRepo(workspacePath) {
    return fs.existsSync(path.join(workspacePath, '.jj'));
}

function getCommits(workspacePath) {
    const command = useJJ ? 'jj log --template "{commit_id} {change_id} {description}"' : 'git log --pretty=format:"%h %s"';
    try {
        const output = cp.execSync(command, { cwd: workspacePath });
        return output.toString().split('\n').map((line, i) => {
            const [id, ...msg] = line.trim().split(' ');
            return { id, message: msg.join(' '), index: i };
        });
    } catch (e) {
        return [];
    }
}

function showGraph(context) {
    const panel = vscode.window.createWebviewPanel(
        'vcsGraph', 'VCS Graph', vscode.ViewColumn.One, { enableScripts: true }
    );

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const workspacePath = workspaceFolders[0].uri.fsPath;
    useJJ = isJJRepo(workspacePath);

    let commits = getCommits(workspacePath);

    const svgHeight = commits.length * 40;
    const svgElements = commits.map((c, i) => {
        const y = 40 * i + 30;
        return `
            <circle cx="20" cy="${y}" r="6" fill="#61afef" />
            <text x="40" y="${y + 4}" fill="white" font-size="14">${c.id} ${c.message}</text>
        `;
    }).join('\n');

    panel.webview.html = `
        <html><body style="color: white; background: #1e1e1e">
        <label><input type="radio" name="mode" value="git" ${!useJJ ? 'checked' : ''}> Git</label>
        <label><input type="radio" name="mode" value="jj" ${useJJ ? 'checked' : ''}> JJ</label>
        <div>
            <svg width="100%" height="${svgHeight}" style="margin-top:10px">
                ${svgElements}
            </svg>
        </div>
        <ul id="contextMenu" style="display:none; position:absolute; background:#2e2e2e; color:white; border:1px solid #666; padding:5px;">
            <li onclick="doAction('checkout')">Checkout</li>
            <li onclick="doAction('revert')">Revert</li>
            <li onclick="doAction('copy')">Copy Commit</li>
        </ul>
        <script>
            let currentCommit = '';
            document.querySelectorAll('input[name=mode]').forEach(el => {
                el.onclick = () => {
                    const mode = el.value;
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({ type: 'switchMode', mode });
                };
            });
            document.querySelectorAll('circle').forEach((el, i) => {
                el.oncontextmenu = e => {
                    e.preventDefault();
                    currentCommit = '${commits[i]?.id}';
                    const menu = document.getElementById('contextMenu');
                    menu.style.left = e.pageX + 'px';
                    menu.style.top = e.pageY + 'px';
                    menu.style.display = 'block';
                };
            });
            window.onclick = () => document.getElementById('contextMenu').style.display = 'none';
            function doAction(action) {
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ type: 'action', action, commit: currentCommit });
            }
        </script></body></html>
    `;

    panel.webview.onDidReceiveMessage(msg => {
        if (msg.type === 'switchMode') {
            useJJ = msg.mode === 'jj';
            showGraph(context);
        } else if (msg.type === 'action') {
            let cmd;
            if (msg.action === 'checkout') {
                cmd = useJJ ? `jj checkout ${msg.commit}` : `git checkout ${msg.commit}`;
            } else if (msg.action === 'revert') {
                cmd = useJJ ? `jj revert ${msg.commit}` : `git revert ${msg.commit}`;
            } else if (msg.action === 'copy') {
                vscode.env.clipboard.writeText(msg.commit);
                return;
            }
            cp.exec(cmd, { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath });
        }
    });
}

function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('vcsGraph.viewGraph', () => showGraph(context)));
}

exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;
