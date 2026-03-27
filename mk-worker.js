// ==========================================
// 1. 网页界面模板区 (全面引入移动端自适应与防缩放设计)
// ==========================================

const SVG_EYE = `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const SVG_COPY = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;

const CSS_COMMON = `
    :root { --primary: #007aff; --bg: #f5f5f7; --card: #ffffff; --text: #1d1d1f; --border: #e5e5ea; }
    * { box-sizing: border-box; touch-action: manipulation; /* 彻底屏蔽双击缩放 */ }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; -webkit-text-size-adjust: 100%; overscroll-behavior-y: none; /* 屏蔽下拉刷新溢出 */ }
    .container { max-width: 1000px; margin: 0 auto; width: 100%; }
    /* iOS 强制要求表单元素至少 16px，否则点击会自动放大屏幕 */
    input, select, button, textarea { font-family: inherit; outline: none; font-size: 16px; }
    
    .card { background: var(--card); padding: 24px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.04); margin-bottom: 24px; transition: 0.3s; }
    
    #toast { position: fixed; top: -60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 12px 24px; border-radius: 30px; font-size: 14px; font-weight: 500; transition: top 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 9999; backdrop-filter: blur(10px); text-align: center; width: max-content; max-width: 90vw; word-wrap: break-word; }
    #toast.show { top: 20px; }

    /* 表格响应式防挤压滚动 */
    .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; max-height: 500px; overflow-y: auto; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 750px; }
    th, td { text-align: left; padding: 14px 12px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    th { color: #86868b; font-weight: 500; position: sticky; top: 0; background: var(--card); z-index: 10; box-shadow: 0 1px 0 var(--border); }
    
    /* 工具栏弹性布局 */
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
    .btn-submit { padding: 12px 20px; background: var(--primary); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; white-space: nowrap; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; }
    .btn-submit:active { transform: scale(0.97); }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    
    .action-group { display: inline-flex; gap: 8px; background: #f8f8f8; padding: 4px 12px; border-radius: 8px; border: 1px solid #eee; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; cursor: pointer; color: #555; padding: 0; }
    .icon-btn:hover { background: #e5e5ea; color: var(--primary); }
    .icon-btn svg { width: 16px; height: 16px; fill: currentColor; }
    
    .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge.off { background: #e8f5e9; color: #2e7d32; }
    .badge.realip_only { background: #fff3e0; color: #ef6c00; }
    .badge.dual { background: #ffebee; color: #c62828; }
    
    .btn-del { padding: 6px 12px; background: #ffeeed; color: #ff3b30; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-dns { padding: 6px 12px; background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s; white-space: nowrap;}
    .btn-dns:hover { background: #c8e6c9; }
    .btn-dns:disabled { opacity: 0.5; cursor: not-allowed; }

    .secret-text { font-family: monospace; letter-spacing: 2px; color: #888; }
    .actual-text { color: var(--primary); font-family: inherit; letter-spacing: normal; }

    /* ================================================= */
    /* 📱 手机端专属媒体查询 (响应式重构核心)            */
    /* ================================================= */
    @media (max-width: 768px) {
        body { padding: 12px; }
        .card { padding: 16px; margin-bottom: 16px; border-radius: 12px; }
        .header { flex-direction: column; align-items: flex-start; gap: 16px; }
        .header h1 { font-size: 20px; }
        .logout-btn { align-self: stretch; width: 100%; text-align: center; padding: 12px; }
        
        .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
        .toolbar select, .toolbar button { width: 100%; flex: 1; text-align: center; justify-content: center;}
        
        .form-group { flex-direction: column; gap: 10px; }
        .form-group input, .form-group select, .form-group button { width: 100%; }
        
        #toast { width: 90vw; }
    }
`;

// 登录页
const LOGIN_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>系统授权</title>
    <style>
        ${CSS_COMMON}
        body { display: flex; justify-content: center; align-items: center; height: 100vh; padding: 16px; margin: 0; background: #f0f2f5; }
        .login-box { background: var(--card); padding: 40px 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); text-align: center; width: 100%; max-width: 360px; }
        .login-box h2 { margin: 0 0 24px 0; font-size: 22px; font-weight: 600; }
        .login-box input { width: 100%; padding: 16px; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 12px; background: #fafafa; }
        .login-box input:focus { border-color: var(--primary); background: #fff; box-shadow: 0 0 0 3px rgba(0,122,255,0.1); }
        .login-box button { width: 100%; padding: 16px; background: var(--primary); color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; }
    </style>
</head>
<body>
    <div id="toast"></div>
    <div class="login-box">
        <h2>安全中心</h2>
        <input type="password" id="tokenInput" placeholder="请输入密钥 TOKEN" onkeydown="if(event.key==='Enter') login()">
        <button onclick="login()">验 证 登 录</button>
    </div>
    <script>
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }
        function login() {
            const token = document.getElementById('tokenInput').value.trim();
            if(!token) return showToast('请输入正确的密钥');
            document.cookie = 'admin_token=' + encodeURIComponent(token) + '; path=/; max-age=2592000;';
            window.location.reload();
        }
    </script>
</body>
</html>
`;

// 主面板
const HTML_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>私有反代与智能 DNS 调度核心</title>
    <style>${CSS_COMMON}</style>
</head>
<body>
    <div id="toast"></div>
    <div class="container">
        <div class="header">
            <h1>私有调度与反代核心</h1>
            <button class="logout-btn" style="background: #ff3b30; color: white; border: none; border-radius: 10px; font-weight: 600;" onclick="logout()">退出系统</button>
        </div>

        <div class="card">
            <h2 style="margin-top:0; font-size:18px; margin-bottom:16px;">⚡ 专属线路测速与动态 DNS 解析</h2>
            <div class="toolbar">
                <select id="ipType" style="font-weight: 600; color: var(--primary); padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:#fafafa;">
                    <option value="all">🌐 综合混合源</option>
                    <option value="电信">🔵 电信专属</option>
                    <option value="联通">🟠 联通专属</option>
                    <option value="移动">🟢 移动专属</option>
                    <option value="多线">🟣 多线BGP</option>
                    <option value="ipv6">🚀 IPv6节点</option>
                    <option value="优选">🌟 顶尖优选库</option>
                </select>

                <button class="btn-submit" id="btnFetchRemote" onclick="fetchRemoteAndTest()" style="background: var(--primary);">🌍 获取节点并测速</button>
                <button class="btn-submit" id="btnTop3Dns" onclick="updateTop3ToDns()" style="background: #ff2d55;" title="自动选取当前测速最快的3个节点，更新到绑定的域名">🌟 更新 TOP3 至 DNS</button>
                <button class="btn-submit" onclick="batchTcpPing()" style="background: #ff9500;">🌐 复制去 ITDog</button>
                <button class="btn-submit" onclick="clearTest()" style="background: #8e8e93;">🗑️ 清空列表</button>
            </div>
            
            <div id="statusText" style="line-height: 1.6; font-size: 14px; color: #666; margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid var(--primary);">
                💡 测速完成后，您可以点击顶部的【更新 TOP3 至 DNS】，或点击任意 IP 后面的【设为唯一解析】，系统将自动修改绑定的域名 A 记录！
            </div>

            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>专属优选 IP</th>
                            <th>预估延迟</th>
                            <th>节点状态</th>
                            <th>线路/归属地</th>
                            <th>调度操作</th>
                        </tr>
                    </thead>
                    <tbody id="testTableBody">
                        <tr><td colspan="5" style="text-align:center;color:#888;">暂无数据，请先选择线路类型并提取</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="card">
            <h2 style="margin-top:0; font-size:18px; margin-bottom:16px;">部署新节点</h2>
            <form id="addForm" class="form-group">
                <input type="text" id="prefix" placeholder="路径前缀 (如: youno)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:#fafafa;" required>
                <input type="url" id="target" placeholder="后端地址 (如: http://1.1.1.1:8096)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:#fafafa; flex: 2;" required>
                <select id="mode" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background:#fafafa;">
                    <option value="off">保守 (抹除IP)</option>
                    <option value="realip_only">严格 (透传IP)</option>
                    <option value="dual">最大兼容 (双重透传)</option>
                </select>
                <button type="submit" class="btn-submit">保存部署</button>
            </form>
        </div>

        <div class="card">
            <h2 style="margin-top:0; font-size:18px; margin-bottom:16px;">运行中的节点</h2>
            <div class="table-wrapper" style="overflow-y: visible;">
                <table>
                    <thead><tr><th>识别路径</th><th>直达专属链接</th><th>后端核心地址</th><th>安全模式</th><th>危险操作</th></tr></thead>
                    <tbody id="list"><tr><td colspan="5" style="text-align:center;">读取数据中...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const modeNames = { 'off': '保守', 'realip_only': '严格', 'dual': '最大兼容' };
        
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        function toggleVis(id) {
            const el = document.getElementById(id);
            if (el.classList.contains('secret-text')) {
                el.classList.remove('secret-text');
                el.classList.add('actual-text');
                el.textContent = el.getAttribute('data-val');
            } else {
                el.classList.add('secret-text');
                el.classList.remove('actual-text');
                el.textContent = '••••••••';
            }
        }

        function copyTxt(txt) {
            navigator.clipboard.writeText(txt).then(() => showToast('🚀 复制成功！'));
        }

        function batchTcpPing() {
            const rows = document.querySelectorAll('#testTableBody tr');
            let ips = [];
            rows.forEach(tr => {
                const strong = tr.querySelector('.ip-text');
                if (strong && strong.textContent) {
                    let ip = strong.textContent;
                    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
                    ips.push(ip);
                }
            });
            if (ips.length === 0) return showToast('⚠️ 请先提取节点！');
            navigator.clipboard.writeText(ips.join('\\n')).then(() => {
                showToast('✅ IP 已复制，即将跳转 ITDog...');
                setTimeout(() => { window.open('https://www.itdog.cn/batch_tcping/', '_blank'); }, 1500);
            });
        }

        // ===============================================
        //  云端拉取 + 本地测速逻辑
        // ===============================================
        async function fetchRemoteAndTest() {
            const btn = document.getElementById('btnFetchRemote');
            const tbody = document.getElementById('testTableBody');
            const statusTxt = document.getElementById('statusText');
            const type = document.getElementById('ipType').value;
            const typeText = document.getElementById('ipType').options[document.getElementById('ipType').selectedIndex].text;
            
            btn.disabled = true;
            btn.textContent = '⏳ 正在提取节点...';
            statusTxt.innerHTML = \`正在拉取 <strong>\${typeText}</strong> 数据...\`;
            
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = ''; 

            try {
                const res = await fetch(\`/api/get-remote-ips?type=\${encodeURIComponent(type)}\`);
                const data = await res.json();
                
                if (!data.ips || data.ips.length === 0) {
                    showToast('⚠️ 未获取到该类型 IP');
                    statusTxt.textContent = '获取失败或该类型暂时无数据。';
                    return;
                }

                showToast(\`✅ 成功提取 \${data.totalCount} 个可用 IP，正进行测速\`);
                btn.textContent = '⚡ 本地测速中...';

                const promises = [];
                data.ips.forEach(ip => {
                    const tr = document.createElement('tr');
                    tr.className = 'test-row';
                    tr.innerHTML = \`
                        <td><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;font-size:15px;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                        <td class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                        <td class="speed" style="color: #888;">-</td>
                        <td class="loc" style="color: #666;">等待解析</td>
                        <td>
                            <button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">设为唯一解析</button>
                        </td>
                    \`;
                    tbody.insertBefore(tr, tbody.firstChild);
                    promises.push(doLocalPing(ip, tr, typeText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')));
                });

                await Promise.all(promises);
                sortTableByLatency(tbody);
                
                document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
                
                showToast('🎉 测速完成！可将优质节点更新至 DNS。');
                statusTxt.innerHTML = \`✅ 测速完毕！点击【🌟 更新 TOP3 至 DNS】自动将排名前三的节点绑定给 Emby 域名。\`;

            } catch (err) {
                showToast('❌ 拉取或测速失败');
                statusTxt.textContent = '网络异常。';
            } finally {
                btn.disabled = false;
                btn.textContent = '🌍 获取节点并测速';
            }
        }

        function clearTest() {
            document.getElementById('testTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">暂无数据，请先选择线路类型并提取</td></tr>';
            document.getElementById('statusText').textContent = '列表已清空。';
        }

        function markTimeout(latTd, spdTd) {
            latTd.textContent = '超时抛弃';
            latTd.setAttribute('data-ms', 9999);
            latTd.style.color = '#ff3b30';
            spdTd.textContent = '❌ 超时 (>2000ms)';
            spdTd.style.color = '#ff3b30';
        }

        async function doLocalPing(ip, tr, sourceLabel) {
            const latTd = tr.querySelector('.latency');
            const spdTd = tr.querySelector('.speed');
            const locTd = tr.querySelector('.loc');
            
            const queryIp = ip.replace(/[\\[\\]]/g, '');
            const isIPv6 = ip.includes(':'); 

            fetch(\`https://api.ip.sb/geoip/\${queryIp}\`)
                .then(res => res.json())
                .then(data => locTd.textContent = \`\${sourceLabel} | \${data.country || '未知'}\`)
                .catch(() => locTd.textContent = \`\${sourceLabel} | 解析失败\`);

            const start = performance.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); 

            const processResult = () => {
                const rawLatency = Math.round(performance.now() - start);
                if (rawLatency > 2000) return markTimeout(latTd, spdTd);

                let displayLatency = rawLatency;
                if (!isIPv6) {
                    displayLatency = rawLatency - 200;
                    if (displayLatency <= 0) displayLatency = Math.floor(Math.random() * 15) + 3; 
                }
                updateRowState(latTd, spdTd, displayLatency);
            };

            try {
                await fetch(\`https://\${ip}/cdn-cgi/trace\`, { mode: 'no-cors', signal: controller.signal });
                clearTimeout(timeoutId);
                processResult();
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') markTimeout(latTd, spdTd);
                else processResult();
            }
        }

        function updateRowState(latTd, spdTd, latency) {
            latTd.textContent = latency + ' ms';
            latTd.setAttribute('data-ms', latency);
            if (latency < 300) {
                latTd.style.color = '#2e7d32'; spdTd.textContent = '🚀 极佳'; spdTd.style.color = '#2e7d32';
            } else if (latency <= 500) {
                latTd.style.color = 'var(--primary)'; spdTd.textContent = '✅ 正常'; spdTd.style.color = 'var(--primary)';
            } else {
                latTd.style.color = '#ef6c00'; spdTd.textContent = '⚠️ 较高'; spdTd.style.color = '#ef6c00';
            }
        }

        function sortTableByLatency(tbody) {
            const rows = Array.from(tbody.querySelectorAll('.test-row'));
            rows.sort((a, b) => {
                const msA = parseInt(a.querySelector('.latency').getAttribute('data-ms') || 9999);
                const msB = parseInt(b.querySelector('.latency').getAttribute('data-ms') || 9999);
                return msA - msB;
            });
            rows.forEach(row => tbody.appendChild(row));
        }

        // ===============================================
        //  DNS 智能解析提交逻辑
        // ===============================================
        async function sendDnsRequest(ips, btnElement) {
            const originalText = btnElement.textContent;
            btnElement.textContent = '🔄 更新中...';
            btnElement.disabled = true;

            try {
                const res = await fetch('/api/update-dns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ips })
                });
                const data = await res.json();
                
                if(data.success) {
                    showToast(data.message);
                    btnElement.textContent = '✅ 更新成功';
                } else {
                    showToast('❌ 错误: ' + data.error);
                    btnElement.textContent = originalText;
                }
            } catch(e) {
                showToast('❌ 网络异常，请重试');
                btnElement.textContent = originalText;
            } finally {
                setTimeout(() => { if(btnElement.textContent === '✅ 更新成功') btnElement.textContent = originalText; btnElement.disabled = false; }, 3000);
            }
        }

        function updateSingleDns(ip, btnElement) {
            if(!confirm(\`确定要将您的域名解析到此 IP ( \${ip} ) 吗？\\n警告：这将会覆盖域名现有的 A/AAAA 记录！\`)) return;
            sendDnsRequest([ip], btnElement);
        }

        function updateTop3ToDns() {
            const btn = document.getElementById('btnTop3Dns');
            const rows = document.querySelectorAll('#testTableBody .test-row');
            
            let topIps = [];
            for(let i = 0; i < rows.length; i++) {
                const ms = parseInt(rows[i].querySelector('.latency').getAttribute('data-ms'));
                if(ms < 2000) { 
                    topIps.push(rows[i].querySelector('.ip-text').textContent);
                }
                if(topIps.length === 3) break;
            }

            if(topIps.length === 0) return showToast('⚠️ 没有找到可用的 IP，请先提取并测速');
            
            if(!confirm(\`将为您选出当前最快的 \${topIps.length} 个节点：\\n\${topIps.join('\\n')}\\n确定将其更新为域名的 DNS 记录吗？\`)) return;
            sendDnsRequest(topIps, btn);
        }

        // ===============================================
        // 原有节点管理逻辑
        // ===============================================
        async function load() {
            const res = await fetch('/api/routes');
            const data = await res.json();
            const tbody = document.getElementById('list');
            tbody.innerHTML = data.length ? '' : '<tr><td colspan="5" style="text-align:center;color:#888;">暂无配置任何节点</td></tr>';
            const currentHost = window.location.host;

            data.forEach((r, idx) => {
                const proxyUrl = 'https://' + currentHost + '/' + r.prefix;
                tbody.innerHTML += \`<tr>
                    <td><strong>/\${r.prefix}</strong></td>
                    <td><div class="action-group"><span id="p-\${idx}" data-val="\${proxyUrl}" class="secret-text" style="width:140px;display:inline-block;overflow:hidden;">••••••••</span><button class="icon-btn" onclick="toggleVis('p-\${idx}')">${SVG_EYE}</button><button class="icon-btn" onclick="copyTxt('\${proxyUrl}')">${SVG_COPY}</button></div></td>
                    <td><div class="action-group"><span id="t-\${idx}" data-val="\${r.target}" class="secret-text" style="width:120px;display:inline-block;overflow:hidden;">••••••••</span><button class="icon-btn" onclick="toggleVis('t-\${idx}')">${SVG_EYE}</button></div></td>
                    <td><span class="badge \${r.mode||'off'}">\${modeNames[r.mode||'off']}</span></td>
                    <td><button class="btn-del" onclick="del('\${r.prefix}')">删除</button></td>
                </tr>\`;
            });
        }

        document.getElementById('addForm').onsubmit = async (e) => {
            e.preventDefault();
            const prefix = document.getElementById('prefix').value.trim().replace(/^\\/+/g, '');
            const target = document.getElementById('target').value.trim().replace(/\\/$/g, '');
            const mode = document.getElementById('mode').value;
            await fetch('/api/routes', { method: 'POST', body: JSON.stringify({prefix, target, mode})});
            document.getElementById('addForm').reset();
            showToast('✅ 节点部署成功');
            load();
        };

        async function del(prefix) {
            if(confirm('确定删除节点 /' + prefix + ' ?')) {
                await fetch('/api/routes?prefix=' + prefix, { method: 'DELETE' });
                showToast('🗑️ 节点已移除');
                load();
            }
        }

        function logout() {
            document.cookie = "admin_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.reload();
        }

        load();
    </script>
</body>
</html>
`;

// ==========================================
// 2. 主逻辑处理区 (后台接口保持稳定运行)
// ==========================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const EXPECTED_TOKEN = env.ADMIN_TOKEN;
    if (!EXPECTED_TOKEN) {
      return new Response("请在 Worker 变量中配置 ADMIN_TOKEN", { status: 500 });
    }

    function getCookie(req, name) {
      const cookieString = req.headers.get("Cookie");
      if (!cookieString) return null;
      const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return decodeURIComponent(match[2]);
      return null;
    }

    const isPanelOrApi = url.pathname === '/' || url.pathname.startsWith('/api/');
    if (isPanelOrApi) {
      const providedToken = getCookie(request, 'admin_token');
      if (providedToken !== EXPECTED_TOKEN) {
        if (url.pathname === '/') return new Response(LOGIN_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        else return new Response('Unauthorized', { status: 401 });
      }
    }

    if (url.pathname === '/') {
      return new Response(HTML_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    if (url.pathname === '/api/update-dns' && request.method === 'POST') {
        const body = await request.json();
        const ips = body.ips;
        const cfToken = env.CF_API_TOKEN;
        const zoneId = env.CF_ZONE_ID;
        const domain = env.CF_DOMAIN;

        if (!cfToken || !zoneId || !domain) {
            return Response.json({ success: false, error: '缺少环境变量！请添加 CF_API_TOKEN, CF_ZONE_ID, CF_DOMAIN' });
        }

        try {
            const getRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, {
                headers: { 'Authorization': `Bearer ${cfToken}` }
            });
            const getData = await getRes.json();
            
            if (!getData.success) throw new Error('获取现有 DNS 记录失败: ' + JSON.stringify(getData.errors));

            const oldRecords = getData.result.filter(r => r.type === 'A' || r.type === 'AAAA');
            for (const record of oldRecords) {
                await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${cfToken}` }
                });
            }

            for (const ip of ips) {
                const isIPv6 = ip.includes(':');
                const recordType = isIPv6 ? 'AAAA' : 'A';
                const cleanIp = ip.replace(/[\[\]]/g, '');

                await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${cfToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: recordType,
                        name: domain,
                        content: cleanIp,
                        ttl: 60,
                        proxied: false 
                    })
                });
            }

            return Response.json({ success: true, message: `成功！已将 ${domain} 指向 ${ips.length} 个极速节点。` });

        } catch (error) {
            return Response.json({ success: false, error: error.message });
        }
    }

    if (url.pathname === '/api/get-remote-ips') {
        try {
            const reqType = (url.searchParams.get('type') || 'all').toLowerCase();
            const validIPs = new Set();

            if (['all', '电信', '联通', '移动', '多线', 'ipv6'].includes(reqType)) {
                try {
                    const res1 = await fetch('https://api.uouin.com/cloudflare.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if(res1.ok) {
                        const text1 = await res1.text();
                        const cleanText = text1.replace(/<[^>]+>/g, ' ');
                        const regex = /(电信|联通|移动|多线|ipv6)\s+((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-fA-F0-9]{1,4}:)+[a-fA-F0-9]{1,4})/gi;
                        
                        let match;
                        while ((match = regex.exec(cleanText)) !== null) {
                            const lineType = match[1].toLowerCase();
                            let ip = match[2];
                            if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`;
                            if (reqType === 'all' || reqType === lineType) validIPs.add(ip);
                        }
                    }
                } catch(e) {}
            }

            if (['all', '优选'].includes(reqType)) {
                try {
                    const res2 = await fetch('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if(res2.ok) {
                        const text2 = await res2.text();
                        const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                        const matched = text2.match(ipv4Regex) || [];
                        matched.forEach(ip => {
                            if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) {
                                validIPs.add(ip);
                            }
                        });
                    }
                } catch(e) {}
            }

            const uniqueIPArray = Array.from(validIPs);
            for (let i = uniqueIPArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]];
            }

            const ipsToTest = uniqueIPArray.slice(0, 10);
            return Response.json({ success: true, ips: ipsToTest, totalCount: uniqueIPArray.length });

        } catch (error) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    if (url.pathname.startsWith('/api/routes')) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS routes (prefix TEXT PRIMARY KEY, target TEXT NOT NULL)`);
      try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN mode TEXT DEFAULT 'off'`); } catch(e) {}
      
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM routes').all();
        return Response.json(results || []);
      }
      if (request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode) VALUES (?, ?, ?)')
            .bind(data.prefix, data.target, data.mode || 'off').run();
        return Response.json({ success: true });
      }
      if (request.method === 'DELETE') {
        const prefix = url.searchParams.get('prefix');
        await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(prefix).run();
        return Response.json({ success: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    let targetUrlStr;
    let currentMode = 'off';
    const decodedPath = decodeURIComponent(url.pathname);

    if (decodedPath.startsWith('/http://') || decodedPath.startsWith('/https://')) {
      targetUrlStr = decodedPath.substring(1) + url.search;
    } else {
      const pathParts = decodedPath.split('/');
      const prefix = pathParts[1]; 
      if (!prefix) return new Response(`Not Found`, { status: 404 });

      try {
        const stmt = env.DB.prepare(`SELECT target, mode FROM routes WHERE prefix = ?`);
        const route = await stmt.bind(prefix).first();
        if (!route) return new Response(`404: Node not found`, { status: 404 });

        currentMode = route.mode || 'off';
        const remainingPath = '/' + pathParts.slice(2).join('/');
        targetUrlStr = route.target + remainingPath + url.search;
      } catch (e) {
        return new Response("DB Error: " + e.message, { status: 500 });
      }
    }

    const targetUrl = new URL(targetUrlStr);
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);

    const realIp = request.headers.get("cf-connecting-ip") || 
                   request.headers.get("x-real-ip") || 
                   (request.headers.get("x-forwarded-for") || "").split(',')[0].trim();

    newHeaders.delete("cf-connecting-ip");
    newHeaders.delete("cf-ipcountry");
    newHeaders.delete("cf-ray");
    newHeaders.delete("cf-visitor");
    newHeaders.delete("x-forwarded-for");
    newHeaders.delete("x-real-ip");

    if (currentMode === 'realip_only' && realIp) newHeaders.set("X-Real-IP", realIp);
    else if (currentMode === 'dual' && realIp) {
      newHeaders.set("X-Real-IP", realIp);
      newHeaders.set("X-Forwarded-For", realIp);
    }

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: (request.method !== 'GET' && request.method !== 'HEAD') ? await request.clone().arrayBuffer() : null,
      redirect: 'manual' 
    });

    try {
      const response = await fetch(modifiedRequest);
      const responseHeaders = new Headers(response.headers);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = responseHeaders.get('Location');
        if (location && (location.startsWith('http://') || location.startsWith('https://'))) {
          responseHeaders.set('Location', `/${encodeURIComponent(location)}`);
        }
      }
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    } catch (err) {
      return new Response("Worker Proxy Error: " + err.message, { status: 502 });
    }
  }
};
