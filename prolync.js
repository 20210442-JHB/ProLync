        let currentRole = '';
        let currentUserId = 'student_01';
        let currentUserName = '';
        let currentCourse = null;
        let currentGroup  = null;
        let userTokens = 320; // 기본 학생 토큰
        let mvpTokens = 500; // 이달의 MVP 기준 토큰 (예시 초기값)
        let mvpUserName = '김철수'; // 이달의 MVP 이름 (예시 초기값)

        // 서버 주소 설정 (포트 번호 확인)
        const SERVER_URL = 'https://prolync-2he4.onrender.com';

        history.replaceState({ viewId: 'view-login' }, "", "#view-login");

        function showView(viewId, pushToHistory = true) {
            document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
            
            const targetView = document.getElementById(viewId);
            if (targetView) targetView.classList.add('active');
            
            window.scrollTo(0, 0);

            // History에 상태 추가
            if (pushToHistory) {
                history.pushState({ viewId: viewId }, "", "#" + viewId);
            }

            // AI 업로드 화면 진입 시 목록 로드
            if (viewId === 'view-ai-upload') loadCriteriaList();
        }

        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.viewId) {
                const viewId = event.state.viewId;
                
                // 로그인/회원가입 컨테이너와 메인 앱 컨테이너 간의 표시 전환
                if (viewId === 'view-login' || viewId === 'view-signup') {
                    document.getElementById('main-nav').style.display = 'none';
                    document.getElementById('app-body').style.display = 'none';
                    document.getElementById('view-login').style.display = '';
                    document.getElementById('view-signup').style.display = '';
                    
                    if (viewId === 'view-login') toggleAuthView('login', false);
                    if (viewId === 'view-signup') toggleAuthView('signup', false);
                } else {
                    document.getElementById('main-nav').style.display = 'flex';
                    document.getElementById('app-body').style.display = 'flex';
                    
                    document.getElementById('view-login').style.display = 'none';
                    document.getElementById('view-signup').style.display = 'none';
                    
                    // 사이드바 메뉴 활성화 상태 동기화
                    document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active'));
                    if (viewId === 'view-course-list') {
                        document.querySelector('.sidebar-menu li:nth-child(1)').classList.add('active');
                    } else if (viewId === 'view-group-list' || viewId === 'view-prof-dashboard' || viewId === 'view-student-dashboard' || viewId === 'view-team-detail') {
                        document.getElementById('menu-team-home').classList.add('active');
                    }

                    showView(viewId, false); // 히스토리에 다시 푸시하지 않고 뷰만 전환
                }
            }
        });

        function toggleAuthView(type, pushToHistory = true) {
            document.getElementById('view-login').classList.remove('active');
            document.getElementById('view-signup').classList.remove('active');
            
            let viewId = 'view-login';
            if(type === 'signup') {
                viewId = 'view-signup';
                document.getElementById('view-signup').classList.add('active');
            } else {
                document.getElementById('view-login').classList.add('active');
            }

            if (pushToHistory) {
                history.pushState({ viewId: viewId }, "", "#" + viewId);
            }
        }

        // 모든 토큰 텍스트 UI 업데이트
        function updateTokenDisplay() {
            document.getElementById('nav-tokens').innerText = `🪙 ${userTokens}`;
            document.querySelectorAll('.display-user-tokens').forEach(el => {
                el.innerText = `🪙 ${userTokens} 토큰`;
            });
        }

        async function refreshMVP() {
            try {
                const res = await fetch(`${SERVER_URL}/api/users/mvp`);
                const data = await res.json();
                mvpTokens = data.tokens;
                mvpUserName = data.name;

                const mvpTokenEl = document.getElementById('mvp-token-count');
                const mvpNameEl = document.getElementById('mvp-user-name');
                if (mvpTokenEl) mvpTokenEl.innerText = `${mvpTokens} 토큰`;
                if (mvpNameEl) mvpNameEl.innerText = mvpUserName;
            } catch (error) {
                console.error("MVP 정보를 불러오는데 실패했습니다.", error);
            }
        }

        async function syncTokensWithDB(newAmount) {
            userTokens = newAmount;
            updateTokenDisplay();
            try {
                await fetch(`${SERVER_URL}/api/users/${currentUserId}/tokens`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tokens: userTokens })
                });
                await refreshMVP(); // DB 업데이트 후 MVP 정보도 다시 가져옴
            } catch (error) {
                console.error("토큰 동기화 실패:", error);
            }
        }

        // 회원가입 처리
async function processSignup() {
    // 1. 화면의 입력창(이름, 학번, 비밀번호)과 선택된 라디오 버튼(역할)에서 값 긁어오기
    const name = document.getElementById('signup-name').value.trim();
    const userId = document.getElementById('signup-id').value.trim();
    const password = document.getElementById('signup-pw').value.trim();
    
    // 선택된 역할(학생 또는 교수) 가져오기
    const roleRadio = document.querySelector('input[name="role"]:checked');
    const role = roleRadio ? roleRadio.value : 'student';

    // 2. 필수 입력값 유효성 검사
    if(!name || !userId || !password) {
        alert("이름, 아이디, 비밀번호를 모두 입력해주세요.");
        return;
    }

    try {
        // 3. 백엔드 서버에 이름(name)과 역할(role)을 포함하여 전송!
        const res = await fetch(`${SERVER_URL}/api/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password, name, role }) // 🌟 name과 role 추가!
        });
        
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            toggleAuthView('login');
        } else {
            alert(data.message || "회원가입에 실패했습니다.");
        }
    } catch (error) {
        console.error("Signup Error:", error);
        alert("서버와 통신 중 오류가 발생했습니다.");
    }
}

        // 로그인 처리
async function login() {
    // 1. 화면의 입력창과 라디오 버튼에서 값 긁어오기
    const userId = document.getElementById('login-id').value.trim(); 
    const password = document.getElementById('login-pw').value.trim();
    
    const roleRadio = document.querySelector('input[name="login-role"]:checked');
    const role = roleRadio ? roleRadio.value : 'student';

    currentRole = role;

    // 2. 유효성 검사
    if (!userId || !password) {
        alert("학번/교번과 비밀번호를 모두 입력해주세요.");
        return;
    }

    let userData;

    try {
        // 3. 백엔드 서버에 로그인 검증 요청
        const res = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password, role }) // 비밀번호와 역할까지 검증
        });

        const data = await res.json();

        if (!res.ok) {
            // 백엔드가 401, 403 에러 리턴 시 메시지 출력 후 중단
            alert(data.message || "로그인에 실패했습니다.");
            return;
        }

        userData = data; // 로그인 성공 시 유저 데이터 할당
        userTokens = userData.tokens;
        currentUserId = userData.userId;
        currentUserName = userData.name || (role === 'prof' ? '교수자' : '학생');

    } catch (error) {
        console.error("Connection Error:", error);
        alert("서버와 통신할 수 없습니다. Node.js 서버가 8080번 포트에서 실행 중인지 확인하세요.");
        return;
    }

    // --- 4. 로그인 성공 후 대시보드 UI 전환 (기존 로직 유지) ---
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-signup').style.display = 'none';
    
    document.getElementById('main-nav').style.display = 'flex';
    document.getElementById('app-body').style.display = 'flex';
    
    if(role === 'prof') {
        document.getElementById('user-info').innerText = userData.name || '교수자';
        document.getElementById('nav-tokens').style.display = 'none';

        document.getElementById('student-milestone-btn').style.display = 'none';
        document.getElementById('unlock-btn').style.display = 'none';
        document.getElementById('unlocked-content').style.display = 'block';
        document.getElementById('btn-edit-report').style.display = 'none';

        document.getElementById('prof-ai-generate-form').style.display = 'block';
        document.getElementById('student-reply-wrapper').style.display = 'block';
    } else {
        document.getElementById('user-info').innerText = userData.name || '학생';
        document.getElementById('nav-tokens').style.display = 'inline-block';

        document.getElementById('student-milestone-btn').style.display = 'block';
        document.getElementById('unlock-btn').style.display = 'flex';
        document.getElementById('unlocked-content').style.display = 'none';
        document.getElementById('btn-edit-report').style.display = 'block';

        document.getElementById('prof-ai-generate-form').style.display = 'none';
        document.getElementById('student-reply-wrapper').style.display = 'block';
    }

    document.getElementById('btn-create-course').style.display = role === 'prof' ? 'flex' : 'none';
    document.getElementById('btn-join-course').style.display = role === 'student' ? 'flex' : 'none';

    updateTokenDisplay();
    refreshMVP();
    loadReportData(1);
    loadMyCourses();

    document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active'));
    document.getElementById('menu-team-home').classList.add('active');

    showView('view-course-list');
}

        // 로그아웃 처리
        function logout() {
            currentRole = '';
            currentCourse = null;
            currentGroup  = null;
            document.getElementById('main-nav').style.display = 'none';
            document.getElementById('app-body').style.display = 'none';

            document.getElementById('view-login').style.display = '';
            document.getElementById('view-signup').style.display = '';

            toggleAuthView('login');
        }

        // ── 과목 내 AI 피드백 기준 자료 ──────────────────────────────────────

        function toggleCriteriaSection() {
            const body = document.getElementById('criteria-section-body');
            const icon = document.getElementById('criteria-toggle-icon');
            if (!body) return;
            const opening = body.style.display === 'none';
            body.style.display = opening ? 'block' : 'none';
            icon.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
            if (opening) loadCourseCriteriaList();
        }

        async function uploadCourseCriteria(inputElement) {
            const file = inputElement.files[0];
            if (!file) return;
            if (!currentCourse) { alert('과목 정보가 없습니다.'); inputElement.value = ''; return; }

            const weekInput = document.getElementById('course-upload-week-num');
            const week = weekInput ? parseInt(weekInput.value) : 1;
            if (!week || week < 1 || week > 30) {
                alert('올바른 주차 번호를 입력해주세요. (1~30)');
                inputElement.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('courseId', currentCourse._id);

            try {
                const res = await fetch(`${SERVER_URL}/api/upload-criteria/${week}`, {
                    method: 'POST',
                    body: formData
                });
                if (!res.ok) throw new Error(await res.text() || '서버 오류');
                await res.json();
                loadCourseCriteriaList();
            } catch (err) {
                alert(`업로드 실패: ${err.message}`);
            }
            inputElement.value = '';
        }

        async function loadCourseCriteriaList() {
            const container = document.getElementById('course-criteria-list-container');
            if (!container || !currentCourse) return;

            container.innerHTML = '<p style="color:#94a3b8;text-align:center;font-size:0.88rem;margin:8px 0;">불러오는 중...</p>';

            try {
                const res  = await fetch(`${SERVER_URL}/api/upload-criteria?courseId=${currentCourse._id}`);
                const data = await res.json();

                if (!Array.isArray(data) || data.length === 0) {
                    container.innerHTML = '<p style="color:#94a3b8;text-align:center;font-size:0.88rem;margin:8px 0;">아직 업로드된 자료가 없습니다.</p>';
                    return;
                }

                container.innerHTML = data.map(item => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;margin-bottom:6px;background:white;border:1px solid #e9d5ff;">
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
                            <span style="color:#6b21a8;font-weight:700;font-size:0.8rem;white-space:nowrap;background:#ede9fe;padding:2px 9px;border-radius:10px;">${item.week}주차</span>
                            <span style="color:#4c1d95;font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${item.fileName}">${item.fileName}</span>
                        </div>
                        <button onclick="deleteCourseCriteria('${item._id}')"
                                style="background:none;border:none;color:#ef4444;cursor:pointer;padding:3px 6px;font-size:0.85rem;flex-shrink:0;" title="삭제">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `).join('');
            } catch {
                container.innerHTML = '<p style="color:#ef4444;text-align:center;font-size:0.88rem;margin:8px 0;">목록을 불러오지 못했습니다.</p>';
            }
        }

        async function deleteCourseCriteria(id) {
            if (!confirm('이 자료를 삭제하시겠습니까?')) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/upload-criteria/${id}`, { method: 'DELETE' });
                if (res.ok) loadCourseCriteriaList();
                else alert('삭제 실패: ' + await res.text());
            } catch { alert('삭제 중 오류가 발생했습니다.'); }
        }

        // 나의 과목 목록 동적 로드
        async function loadMyCourses() {
            const listEl = document.getElementById('course-dynamic-list');
            if (!listEl) return;
            listEl.innerHTML = '<p style="color: var(--text-sub); text-align: center; padding: 20px;">과목을 불러오는 중...</p>';

            try {
                const res = await fetch(`${SERVER_URL}/api/courses/by-user/${currentUserId}?role=${currentRole}`);
                const courses = await res.json();
                listEl.innerHTML = '';

                if (!Array.isArray(courses) || courses.length === 0) {
                    listEl.innerHTML = '<p style="color: var(--text-sub); text-align: center; padding: 30px;">참여 중인 과목이 없습니다.</p>';
                    return;
                }

                courses.forEach(course => {
                    const item = document.createElement('div');
                    item.className = 'course-item';
                    item.style.cursor = 'pointer';
                    item.onclick = () => { currentCourse = course; enterCourse(); };

                    const infoDiv = document.createElement('div');

                    const titleEl = document.createElement('h3');
                    titleEl.style.cssText = 'margin: 0 0 5px 0;';
                    titleEl.textContent = course.title;

                    const subEl = document.createElement('p');
                    subEl.style.cssText = 'margin: 0; font-size: 0.85rem; color: var(--text-sub);';

                    if (currentRole === 'prof') {
                        subEl.innerHTML = `초대 코드: <strong style="color: var(--primary); letter-spacing: 2px;">${course.inviteCode}</strong> &nbsp;|&nbsp; 수강생 ${course.enrolledStudents.length}명`;
                    } else {
                        subEl.textContent = `담당 교수: ${course.professorName}`;
                    }

                    infoDiv.appendChild(titleEl);
                    infoDiv.appendChild(subEl);

                    const btnGroup = document.createElement('div');
                    btnGroup.style.cssText = 'display: flex; gap: 10px; align-items: center; flex-shrink: 0;';

                    const enterBtn = document.createElement('button');
                    enterBtn.className = 'btn';
                    enterBtn.innerHTML = '과목 홈 바로가기 <i class="fa-solid fa-arrow-right"></i>';
                    enterBtn.onclick = (e) => { e.stopPropagation(); currentCourse = course; enterCourse(); };
                    btnGroup.appendChild(enterBtn);

                    if (currentRole === 'prof') {
                        const delBtn = document.createElement('button');
                        delBtn.className = 'btn';
                        delBtn.style.cssText = 'background: var(--red); padding: 10px 14px;';
                        delBtn.title = '과목 삭제';
                        delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                        delBtn.onclick = (e) => { e.stopPropagation(); deleteCourse(course._id); };
                        btnGroup.appendChild(delBtn);
                    }

                    item.appendChild(infoDiv);
                    item.appendChild(btnGroup);
                    listEl.appendChild(item);
                });
            } catch (err) {
                listEl.innerHTML = '<p style="color: var(--text-sub); text-align: center; padding: 20px;">과목 목록을 불러오지 못했습니다.</p>';
            }
        }

        // 교수자: 과목 삭제
        async function deleteCourse(courseId) {
            if (!confirm('이 과목을 삭제하시겠습니까? 모든 수강생 정보가 함께 삭제됩니다.')) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/courses/${courseId}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) {
                    loadMyCourses();
                } else {
                    alert(data.message || '삭제에 실패했습니다.');
                }
            } catch (err) {
                alert('서버 오류가 발생했습니다.');
            }
        }

        // 교수자: 과목 생성
        async function createCourse() {
            const titleInput = document.getElementById('new-course-title');
            const title = titleInput.value.trim();
            if (!title) { alert("과목명을 입력해주세요."); return; }

            try {
                const res = await fetch(`${SERVER_URL}/api/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, professorId: currentUserId, professorName: currentUserName })
                });
                const data = await res.json();
                if (res.ok) {
                    document.getElementById('create-course-form').style.display = 'none';
                    titleInput.value = '';
                    showInviteCodeResult(data.title, data.inviteCode);
                    loadMyCourses();
                } else {
                    alert(data.message || "과목 생성에 실패했습니다.");
                }
            } catch (err) {
                alert("서버 오류가 발생했습니다.");
            }
        }

        function showInviteCodeResult(title, code) {
            const resultEl = document.getElementById('invite-code-result');
            document.getElementById('result-course-title').textContent = title;
            document.getElementById('result-invite-code').textContent = code;
            resultEl.style.display = 'block';
        }

        function copyInviteCode() {
            const code = document.getElementById('result-invite-code').textContent;
            navigator.clipboard.writeText(code).then(() => alert(`초대 코드 "${code}"가 복사되었습니다!`));
        }

        // 학생: 초대 코드로 과목 참여
        async function joinCourse() {
            const codeInput = document.getElementById('join-course-code');
            const code = codeInput.value.trim().toUpperCase();
            if (!code) { alert("초대 코드를 입력해주세요."); return; }

            try {
                const res = await fetch(`${SERVER_URL}/api/courses/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inviteCode: code, userId: currentUserId, name: currentUserName })
                });
                const data = await res.json();
                if (res.ok) {
                    alert(`"${data.title}" 과목에 참여했습니다!`);
                    codeInput.value = '';
                    document.getElementById('join-course-form').style.display = 'none';
                    loadMyCourses();
                } else {
                    alert(data.message || "과목 참여에 실패했습니다.");
                }
            } catch (err) {
                alert("서버 오류가 발생했습니다.");
            }
        }

        // 대시보드 진입 
        function enterCourse() {
            if (!currentCourse) return;
            document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active'));
            document.getElementById('menu-team-home').classList.add('active');
            currentGroup = null;
            loadGroupList(currentCourse._id);
            showView('view-group-list');
        }

        async function loadTotalTokens() {
            const totalTokensEl = document.getElementById('total-cumulative-tokens');
            if (!totalTokensEl) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/users/total-tokens`);
                const data = await res.json();
                totalTokensEl.innerText = `${data.totalTokens.toLocaleString()} 토큰`;
            } catch (error) {
                console.error("누적 토큰 로드 실패:", error);
            }
        }

        async function loadOverallSummary() {
            const summaryEl = document.getElementById('ai-overall-summary-text');
            if (!summaryEl) return;
            summaryEl.innerText = "데이터를 분석 중입니다...";
            try {
                const params = new URLSearchParams();
                if (currentCourse?._id) params.set('courseId', currentCourse._id);
                if (currentGroup?._id)  params.set('groupId',  currentGroup._id);
                const res = await fetch(`${SERVER_URL}/api/reports/overall-summary?${params}`);
                const data = await res.json();
                summaryEl.innerText = data.summary;
            } catch {
                summaryEl.innerText = "요약을 불러오는 데 실패했습니다.";
            }
        }

        // ── 조(Group) 관련 함수 ───────────────────────────────────────────

        // 조 목록 로드 및 렌더링
        async function loadGroupList(courseId) {
            const titleEl  = document.getElementById('group-list-course-title');
            const listEl   = document.getElementById('group-dynamic-list');
            const myInfoEl = document.getElementById('my-group-info');
            if (!listEl) return;

            if (titleEl && currentCourse) titleEl.textContent = currentCourse.title;
            listEl.innerHTML = '<p style="color:var(--text-sub);text-align:center;padding:20px;">불러오는 중...</p>';

            // 강의계획서 + AI 기준 섹션 표시 (교수만)
            const syllabusSection   = document.getElementById('syllabus-upload-section');
            const aiCriteriaSection = document.getElementById('course-ai-criteria-section');
            if (syllabusSection)   syllabusSection.style.display   = currentRole === 'prof' ? 'block' : 'none';
            if (aiCriteriaSection) aiCriteriaSection.style.display = currentRole === 'prof' ? 'block' : 'none';

            // 학생용 버튼 표시
            const btnCreate = document.getElementById('btn-create-group');
            const btnJoin   = document.getElementById('btn-join-group');

            try {
                const [groupsRes, myGroupRes] = await Promise.all([
                    fetch(`${SERVER_URL}/api/groups/by-course/${courseId}`),
                    currentRole === 'student'
                        ? fetch(`${SERVER_URL}/api/groups/my/${currentUserId}?courseId=${courseId}`)
                        : Promise.resolve(null)
                ]);
                const groups  = await groupsRes.json();
                const myGroup = myGroupRes ? await myGroupRes.json() : null;

                // 학생: 조가 없을 때만 만들기/참여 버튼 표시
                if (btnCreate) btnCreate.style.display = (currentRole === 'student' && !myGroup) ? 'flex' : 'none';
                if (btnJoin)   btnJoin.style.display   = (currentRole === 'student' && !myGroup) ? 'flex' : 'none';

                // 내 조 안내 (학생)
                if (myInfoEl) {
                    if (currentRole === 'student' && myGroup) {
                        myInfoEl.style.display = 'block';
                        myInfoEl.innerHTML = `<i class="fa-solid fa-star" style="color:var(--yellow);"></i> 나의 소속 조: <strong>${myGroup.name}</strong> &nbsp;|&nbsp; 초대 코드: <strong style="color:var(--primary);letter-spacing:2px;">${myGroup.inviteCode}</strong>`;
                    } else {
                        myInfoEl.style.display = 'none';
                    }
                }

                listEl.innerHTML = '';
                if (!Array.isArray(groups) || groups.length === 0) {
                    listEl.innerHTML = '<p style="color:var(--text-sub);text-align:center;padding:30px;">아직 생성된 조가 없습니다.</p>';
                    return;
                }

                groups.forEach(group => {
                    const isMine = myGroup && myGroup._id === group._id;
                    const card = document.createElement('div');
                    card.className = 'course-item';
                    card.style.cssText = `cursor:pointer; ${isMine ? 'border-left:4px solid var(--green); background:#f0fdf4;' : ''}`;
                    card.onclick = () => { currentGroup = group; showTeamDetail(); };

                    const infoDiv = document.createElement('div');

                    const nameEl = document.createElement('h3');
                    nameEl.style.cssText = 'margin:0 0 5px 0;';
                    const pendingBadge = (currentRole === 'prof' && group.milestoneStatus === 'pending_approval')
                        ? ' <span style="font-size:0.75rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-weight:600;">⏳ 마일스톤 승인 대기</span>' : '';
                    nameEl.innerHTML = group.name + (isMine ? ' ⭐ (내 조)' : '') + pendingBadge;

                    const subEl = document.createElement('p');
                    subEl.style.cssText = 'margin:0;font-size:0.85rem;color:var(--text-sub);';
                    if (currentRole === 'prof') {
                        subEl.innerHTML = `초대 코드: <strong style="letter-spacing:2px;color:var(--primary);">${group.inviteCode}</strong> &nbsp;|&nbsp; 팀원 ${group.members.length}명`;
                    } else {
                        subEl.textContent = `팀원 ${group.members.length}명 | 조장: ${group.leaderName}`;
                    }

                    infoDiv.appendChild(nameEl);
                    infoDiv.appendChild(subEl);

                    const btn = document.createElement('button');
                    btn.className = 'btn';
                    btn.innerHTML = '상세 보기 <i class="fa-solid fa-arrow-right"></i>';
                    btn.onclick = (e) => { e.stopPropagation(); currentGroup = group; showTeamDetail(); };

                    card.appendChild(infoDiv);
                    card.appendChild(btn);
                    listEl.appendChild(card);
                });
            } catch (err) {
                listEl.innerHTML = '<p style="color:var(--text-sub);text-align:center;padding:20px;">조 목록을 불러오지 못했습니다.</p>';
            }
        }

        // 조 만들기 (학생)
        async function createGroup() {
            const nameInput = document.getElementById('new-group-name');
            const name = nameInput.value.trim();
            if (!name) { alert('조 이름을 입력해주세요.'); return; }
            if (!currentCourse) { alert('과목 정보가 없습니다.'); return; }
            try {
                const res = await fetch(`${SERVER_URL}/api/groups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, courseId: currentCourse._id, leaderId: currentUserId, leaderName: currentUserName })
                });
                const data = await res.json();
                if (res.ok) {
                    document.getElementById('create-group-form').style.display = 'none';
                    nameInput.value = '';
                    showGroupInviteResult(data.name, data.inviteCode);
                    loadGroupList(currentCourse._id);
                } else {
                    alert(data.message || '조 생성에 실패했습니다.');
                }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        function showGroupInviteResult(name, code) {
            const el = document.getElementById('group-invite-result');
            document.getElementById('group-result-name').textContent  = name;
            document.getElementById('group-result-code').textContent  = code;
            el.style.display = 'block';
        }

        function copyGroupInviteCode() {
            const code = document.getElementById('group-result-code').textContent;
            navigator.clipboard.writeText(code).then(() => alert(`초대 코드 "${code}"가 복사되었습니다!`));
        }

        // 초대 코드로 조 참여 (학생)
        async function joinGroup() {
            const codeInput = document.getElementById('join-group-code');
            const code = codeInput.value.trim().toUpperCase();
            if (!code) { alert('초대 코드를 입력해주세요.'); return; }
            try {
                const res = await fetch(`${SERVER_URL}/api/groups/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inviteCode: code, userId: currentUserId, name: currentUserName })
                });
                const data = await res.json();
                if (res.ok) {
                    alert(`"${data.name}" 조에 참여했습니다!`);
                    codeInput.value = '';
                    document.getElementById('join-group-form').style.display = 'none';
                    loadGroupList(currentCourse._id);
                } else {
                    alert(data.message || '참여에 실패했습니다.');
                }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // ── 동적 타임라인 / 주차 렌더링 ─────────────────────────────────────

        const DEFAULT_MILESTONES = ['아이디어 도출', 'UI/UX 설계', '프론트/백엔드 구현', '통합 테스트', '최종 발표'];
        const DEFAULT_WEEK_COUNT = 15;

        function getMilestones() {
            const ms = currentCourse?.syllabusAnalysis?.milestones;
            if (ms && ms.length > 0) return ms.map(m => m.label || m);
            return DEFAULT_MILESTONES;
        }

        function getWeekCount() {
            return currentCourse?.syllabusAnalysis?.weekCount || DEFAULT_WEEK_COUNT;
        }

        function getWeekTopic(weekNum) {
            const plan = currentCourse?.syllabusAnalysis?.weeklyPlan;
            if (!plan) return '';
            const entry = plan.find(p => p.week === weekNum);
            return entry ? entry.topic : '';
        }

        function renderWeekCircles(weekCount) {
            const container = document.getElementById('week-circles-container');
            if (!container) return;
            container.innerHTML = '';
            for (let i = 1; i <= weekCount; i++) {
                const circle = document.createElement('div');
                circle.className = 'week-circle' + (i === currentWeek ? ' active' : '');
                circle.textContent = String(i).padStart(2, '0');
                circle.onclick = () => {
                    document.querySelectorAll('.week-circle').forEach(c => c.classList.remove('active'));
                    circle.classList.add('active');
                    updateWeekTitle(i);
                    loadReportData(i);
                };
                container.appendChild(circle);
            }
        }

        function updateWeekTitle(weekNum) {
            const titleEl = document.getElementById('weekly-detail-title');
            if (!titleEl) return;
            const topic = getWeekTopic(weekNum);
            titleEl.textContent = `${weekNum}주차${topic ? ': ' + topic : ''}`;
        }

        function renderTimeline(milestones, currentIdx) {
            const container = document.getElementById('timeline-container');
            if (!container) return;
            container.innerHTML = '';
            milestones.forEach((label, idx) => {
                const step = document.createElement('div');
                const isCompleted = idx < currentIdx;
                const isActive    = idx === currentIdx;
                step.className = 'timeline-step' + (isCompleted ? ' step-completed' : '') + (isActive ? ' step-active' : '');

                const dot = document.createElement('div');
                dot.className = 'step-dot';
                if (isCompleted) {
                    dot.innerHTML = '<i class="fa-solid fa-check"></i>';
                } else if (!isActive) {
                    dot.style.cssText = 'background: white; color: #ccc;';
                    dot.textContent = idx + 1;
                } else {
                    dot.textContent = idx + 1;
                }

                const lbl = document.createElement('div');
                lbl.className = 'step-label';
                lbl.textContent = label;
                if (isActive) lbl.style.cssText = 'color: var(--primary); font-weight: bold;';

                step.appendChild(dot);
                step.appendChild(lbl);
                container.appendChild(step);
            });
        }

        function updateMilestoneUI() {
            const milestones  = getMilestones();
            const currentIdx  = currentGroup?.currentMilestoneIdx ?? 0;
            const status      = currentGroup?.milestoneStatus || 'active';
            const currentLabel = milestones[currentIdx] || '완료';

            const milestoneBtn = document.getElementById('student-milestone-btn');
            const pendingEl    = document.getElementById('milestone-pending-info');
            const profApproval = document.getElementById('prof-milestone-approval');
            const pendingLabel = document.getElementById('pending-milestone-label');

            renderTimeline(milestones, currentIdx);

            if (currentRole === 'student') {
                if (profApproval) profApproval.style.display = 'none';
                if (status === 'active' && currentIdx < milestones.length) {
                    if (milestoneBtn) {
                        milestoneBtn.style.display = 'block';
                        milestoneBtn.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> [${currentLabel}] 마일스톤 완료 보고 (+50 토큰)`;
                    }
                    if (pendingEl) pendingEl.style.display = 'none';
                } else if (status === 'pending_approval') {
                    if (milestoneBtn) milestoneBtn.style.display = 'none';
                    if (pendingEl) { pendingEl.style.display = 'flex'; pendingEl.querySelector('span').textContent = `"${currentLabel}" 완료 보고 — 교수님의 승인을 기다리고 있습니다.`; }
                } else {
                    if (milestoneBtn) milestoneBtn.style.display = 'none';
                    if (pendingEl) { pendingEl.style.display = 'flex'; pendingEl.querySelector('span').textContent = '모든 마일스톤을 완료했습니다!'; }
                }
            } else if (currentRole === 'prof') {
                if (milestoneBtn) milestoneBtn.style.display = 'none';
                if (pendingEl)    pendingEl.style.display    = 'none';
                if (status === 'pending_approval') {
                    if (profApproval) {
                        profApproval.style.display = 'flex';
                        if (pendingLabel) pendingLabel.textContent = currentLabel;
                    }
                } else {
                    if (profApproval) profApproval.style.display = 'none';
                }
            }
        }

        // ── 노션 페이지 요약 ──────────────────────────────────────────────────────

        function renderNotionSection() {
            const link    = currentGroup?.notionLink;
            const summary = currentGroup?.notionSummary;
            const at      = currentGroup?.notionSummarizedAt;

            // 노션 열기 버튼
            const openBtn = document.getElementById('notion-open-btn');
            if (openBtn) {
                if (link) { openBtn.href = link; openBtn.style.display = 'flex'; }
                else       { openBtn.style.display = 'none'; }
            }

            // 학생만 URL 입력 창 표시
            const inputWrapper = document.getElementById('notion-input-wrapper');
            if (inputWrapper) {
                inputWrapper.style.display = currentRole === 'student' ? 'block' : 'none';
                if (link) {
                    const urlInput = document.getElementById('notion-url-input');
                    if (urlInput) urlInput.value = link;
                }
            }

            // 요약 영역 렌더링
            const displayEl = document.getElementById('notion-summary-display');
            if (!displayEl) return;

            if (summary) {
                const dateStr = at ? new Date(at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                displayEl.innerHTML = `
                    <div style="background:var(--ai-light); border:1px solid #d8b4fe; border-radius:10px; padding:16px 20px;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <i class="fa-solid fa-robot" style="color:var(--ai-color);"></i>
                            <strong style="color:#6b21a8; font-size:0.9rem;">AI 요약</strong>
                            ${dateStr ? `<span style="font-size:0.78rem; color:var(--text-sub); margin-left:4px;">${dateStr} 기준</span>` : ''}
                            ${currentRole === 'student' ? `<button onclick="submitNotionLink()" style="margin-left:auto; background:none; border:1px solid #d8b4fe; color:#7c3aed; font-size:0.78rem; padding:2px 10px; border-radius:10px; cursor:pointer;">재요약</button>` : ''}
                        </div>
                        <p style="margin:0; font-size:0.93rem; line-height:1.7; color:#4c1d95; white-space:pre-wrap;">${summary}</p>
                    </div>`;
            } else {
                displayEl.innerHTML = `
                    <div style="text-align:center; padding:24px 0; color:var(--text-sub);">
                        <i class="fa-solid fa-file-circle-question" style="font-size:2rem; margin-bottom:10px; display:block; color:#d8b4fe;"></i>
                        <p style="margin:0; font-size:0.9rem;">
                            ${currentRole === 'student'
                                ? '위에 Notion 페이지 URL을 입력하면 AI가 내용을 요약해 드립니다.'
                                : '학생이 아직 Notion 페이지를 등록하지 않았습니다.'}
                        </p>
                    </div>`;
            }
        }

        async function submitNotionLink() {
            const input = document.getElementById('notion-url-input');
            const url   = input ? input.value.trim() : '';

            if (!url)                        { alert('Notion URL을 입력해주세요.'); return; }
            if (!url.startsWith('http'))     { alert('올바른 URL을 입력해주세요.'); return; }
            if (!currentGroup)               { alert('조 정보가 없습니다.'); return; }

            const btn = document.getElementById('notion-submit-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...'; }

            try {
                const res = await fetch(`${SERVER_URL}/api/groups/${currentGroup._id}/notion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notionUrl: url })
                });
                const raw = await res.text();
                let data; try { data = JSON.parse(raw); } catch { data = { message: raw }; }

                if (res.ok) {
                    currentGroup = data;
                    renderNotionSection();
                } else {
                    alert(`오류: ${data.message}`);
                }
            } catch (err) {
                console.error('[submitNotionLink]', err);
                alert('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 요약'; }
            }
        }

        // 조 상세 진입
        function showTeamDetail() {
            const titleEl = document.getElementById('team-detail-title');
            if (titleEl && currentGroup) titleEl.textContent = currentGroup.name + ' 상세 현황';
            const weekCount = getWeekCount();
            renderWeekCircles(weekCount);
            updateMilestoneUI();
            renderNotionSection();
            loadReportData(1);
            showView('view-team-detail');
        }

        // ── 마일스톤 요청 / 승인 / 반려 ─────────────────────────────────────

        async function requestMilestone() {
            if (!currentGroup) return;
            if (!confirm('현재 마일스톤 완료를 보고하시겠습니까? 교수님 승인 후 다음 단계로 진행됩니다.')) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/groups/${currentGroup._id}/milestone-request`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    currentGroup = await res.json();
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                    syncTokensWithDB(userTokens + 50);
                    setTimeout(() => updateMilestoneUI(), 400);
                } else { alert('요청에 실패했습니다.'); }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        async function approveMilestone() {
            if (!currentGroup) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/groups/${currentGroup._id}/milestone-approve`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    currentGroup = await res.json();
                    alert('마일스톤을 승인했습니다!');
                    updateMilestoneUI();
                    loadGroupList(currentCourse._id);
                } else { alert('처리에 실패했습니다.'); }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        async function rejectMilestone() {
            if (!currentGroup) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/groups/${currentGroup._id}/milestone-reject`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    currentGroup = await res.json();
                    alert('마일스톤을 반려했습니다. 학생이 다시 보고할 수 있습니다.');
                    updateMilestoneUI();
                    loadGroupList(currentCourse._id);
                } else { alert('처리에 실패했습니다.'); }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 강의 계획서 업로드
        // 강의계획서 탭 전환
        function switchSyllabusTab(tab) {
            const isFile = tab === 'file';
            document.getElementById('syllabus-panel-file').style.display = isFile ? 'flex' : 'none';
            document.getElementById('syllabus-panel-text').style.display = isFile ? 'none' : 'block';
            document.getElementById('tab-file').style.cssText = isFile
                ? 'padding:7px 18px;font-size:0.85rem;background:var(--ai-color);color:white;border:none;cursor:pointer;'
                : 'padding:7px 18px;font-size:0.85rem;background:transparent;color:#6b21a8;border:none;cursor:pointer;';
            document.getElementById('tab-text').style.cssText = isFile
                ? 'padding:7px 18px;font-size:0.85rem;background:transparent;color:#6b21a8;border:none;cursor:pointer;'
                : 'padding:7px 18px;font-size:0.85rem;background:var(--ai-color);color:white;border:none;cursor:pointer;';
        }

        // 직접 입력 텍스트로 분석
        async function analyzeSyllabusText() {
            const ta = document.getElementById('syllabus-text-input');
            const text = ta ? ta.value.trim() : '';
            if (!text) { alert('분석할 텍스트를 입력해주세요.'); return; }
            if (!currentCourse) { alert('과목이 선택되지 않았습니다.'); return; }

            const statusEl = document.getElementById('syllabus-status');
            const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
            setStatus('AI가 분석 중입니다...');

            try {
                const res = await fetch(`${SERVER_URL}/api/courses/${currentCourse._id}/syllabus-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                const raw = await res.text();
                let data; try { data = JSON.parse(raw); } catch { data = { message: raw }; }

                if (res.ok) {
                    currentCourse = data.course;
                    const ms = currentCourse.syllabusAnalysis;
                    setStatus(`완료! ${ms.weekCount}주차 · 마일스톤 ${ms.milestones.length}개 설정됨`);
                    alert(`강의 계획서 분석 완료!\n총 ${ms.weekCount}주차\n마일스톤: ${ms.milestones.map(m => m.label).join(' → ')}`);
                    if (ta) ta.value = '';
                } else {
                    setStatus(`오류: ${data.message}`);
                    alert(`분석 실패: ${data.message}`);
                }
            } catch (err) {
                console.error('[analyzeSyllabusText]', err);
                setStatus('서버 연결 오류');
                alert('서버에 연결할 수 없습니다.');
            }
        }

        async function uploadSyllabus(inputElement) {
            const file = inputElement.files[0];
            if (!file) return;
            if (!currentCourse) { alert('과목이 선택되지 않았습니다.'); return; }

            const statusEl = document.getElementById('syllabus-status');
            const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

            setStatus('AI가 강의 계획서를 분석 중입니다...');

            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch(`${SERVER_URL}/api/courses/${currentCourse._id}/syllabus`, {
                    method: 'POST', body: formData
                });

                // 응답이 JSON이 아닐 수 있으므로 text로 먼저 받아서 파싱
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch { data = { message: text }; }

                if (res.ok) {
                    currentCourse = data.course;
                    const ms = currentCourse.syllabusAnalysis;
                    setStatus(`완료! ${ms.weekCount}주차 · 마일스톤 ${ms.milestones.length}개 설정됨`);
                    alert(`강의 계획서 분석 완료!\n총 ${ms.weekCount}주차\n마일스톤: ${ms.milestones.map(m => m.label).join(' → ')}`);
                } else {
                    const errMsg = data.message || '분석에 실패했습니다.';
                    setStatus(`⚠ ${errMsg}`);
                    // 이미지 PDF 오류면 자동으로 직접 입력 탭으로 전환
                    if (data.hint || errMsg.includes('이미지') || errMsg.includes('텍스트를 추출')) {
                        setTimeout(() => {
                            switchSyllabusTab('text');
                            setStatus('직접 입력 탭에서 강의 계획서 내용을 붙여넣어 주세요.');
                        }, 800);
                    } else {
                        alert(`업로드 실패: ${errMsg}`);
                    }
                }
            } catch (err) {
                console.error('[uploadSyllabus]', err);
                setStatus('서버 연결 오류');
                alert('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.');
            }
            inputElement.value = '';
        }

        function goBackToDashboard() {
            history.back();
        }

        // 주차별 보고서 수정 모드 토글
        function toggleEditMode() {
            const viewMode = document.getElementById('report-view-mode');
            const editMode = document.getElementById('report-edit-mode');
            if (viewMode.style.display === 'none') {
                viewMode.style.display = 'block';
                editMode.style.display = 'none';
            } else {
                viewMode.style.display = 'none';
                editMode.style.display = 'block';
            }
        }

        let currentWeek = 1;

async function saveReport() {
    // 1. HTML의 입력 필드에서 데이터 가져오기
    const titleInput = document.getElementById('edit-title');
    const contentInput = document.getElementById('edit-content');
    
    if (!titleInput || !contentInput) return;
    
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
        alert("제목과 내용을 모두 입력해 주세요.");
        return;
    }

    // 로딩 표시 (AI가 생각하는 동안 버튼 비활성화 등 시각적 피드백)
    const saveBtn = document.querySelector("button[onclick='saveReport()']");
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> AI 분석 및 제출 중...";

    try {
        // 2. 백엔드 API로 데이터 전송
        const response = await fetch(`${SERVER_URL}/api/reports/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week: currentWeek,
                title: title,
                content: content,
                authorId: currentUserId,
                courseId: currentCourse?._id,
                groupId:  currentGroup?._id
            })
        });

        const data = await response.json();

        if (data.success) {
            alert("🎉 보고서 제출 및 AI 피드백 학습이 완료되었습니다!");
            
            loadReportData(currentWeek); // DB에서 전체 데이터를 다시 불러와 UI 갱신 (댓글 포함)
            toggleEditMode(); // 수정 모드 닫기
            
            // 축하 이펙트 (인덱스에 선언된 폭죽 효과 실행!)
            if (typeof confetti === 'function') {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
        } else {
            alert("오류 발생: " + data.error);
        }

    } catch (error) {
        console.error("보고서 제출 통신 에러:", error);
        alert("서버와 통신하는 중 실패했습니다.");
    } finally {
        // 버튼 복구
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
}

async function loadReportData(week) {
    currentWeek = week;
    updateWeekTitle(week);
    try {
        const params = new URLSearchParams();
        if (currentCourse?._id) params.set('courseId', currentCourse._id);
        if (currentGroup?._id)  params.set('groupId',  currentGroup._id);
        const res = await fetch(`${SERVER_URL}/api/reports/${week}?${params}`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('display-title').innerText = data.title || "";
            const displayContent = document.getElementById('display-content');
            const heading = document.createElement('h4');
            heading.style.cssText = 'color: white; margin-top: 20px;';
            heading.textContent = '제출 내용';
            const para = document.createElement('p');
            para.style.cssText = 'color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;';
            para.textContent = data.content || '';
            displayContent.innerHTML = '';
            displayContent.appendChild(heading);
            displayContent.appendChild(para);
            document.getElementById('edit-title').value = data.title || "";
            document.getElementById('edit-content').value = data.content || "";
            
            const feedbackTextElement = document.querySelector('#feedback-display-area p');
            if (feedbackTextElement) {
                feedbackTextElement.innerText = data.aiFeedback || "AI 피드백이 생성되지 않았습니다.";
            }

            renderStudentReplies(data.studentReplies);
        } else {
            // 데이터가 없는 주차일 경우 UI 초기화
            clearReportUI();
        }
    } catch (err) {
        clearReportUI();
        console.log("데이터 로딩 실패:", err);
    }
}

// 보고서 관련 UI 요소들을 초기 상태로 만드는 함수
function clearReportUI() {
    const displayTitle = document.getElementById('display-title');
    const displayContent = document.getElementById('display-content');
    const editTitle = document.getElementById('edit-title');
    const editContent = document.getElementById('edit-content');
    const feedbackArea = document.querySelector('#feedback-display-area p');
    const studentReplyDisplay = document.getElementById('student-reply-display');

    if (displayTitle) displayTitle.innerText = "제출된 보고서가 없습니다.";
    if (displayContent) displayContent.innerHTML = "";
    if (editTitle) editTitle.value = "";
    if (editContent) editContent.value = "";
    if (feedbackArea) feedbackArea.innerText = "보고서를 제출하면 AI 피드백을 받을 수 있습니다.";
    if (studentReplyDisplay) { studentReplyDisplay.innerHTML = ''; studentReplyDisplay.style.display = 'none'; }
}

        // AI 피드백 자동 생성
        async function generateAIFeedback() {
            await fetch(`${SERVER_URL}/api/reports/${currentWeek}/ai-feedback`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: currentCourse?._id, groupId: currentGroup?._id })
            });
            alert("AI 피드백이 생성되어 DB에 반영되었습니다.");
            loadReportData(currentWeek);
        }

        // 학생 코멘트 등록
        async function submitStudentReply() {
            const ta = document.getElementById('reply-textarea');
            const text = ta.value.trim();
            if (!text) { alert("답변 내용을 입력해주세요."); return; }

            const res = await fetch(`${SERVER_URL}/api/reports/${currentWeek}/reply`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reply: text, name: currentUserName, courseId: currentCourse?._id, groupId: currentGroup?._id })
            });

            if (res.ok) {
                ta.value = '';
                loadReportData(currentWeek);
            } else {
                alert("등록에 실패했습니다. 먼저 보고서를 제출했는지 확인해주세요.");
            }
        }

        // ── 코멘트/답글 렌더링 ─────────────────────────────────────────

        function makeSmallBtn(label, isDanger, onClick) {
            const btn = document.createElement('button');
            btn.style.cssText = `background: none; color: ${isDanger ? 'var(--red)' : 'var(--text-sub)'}; font-size: 0.78rem; padding: 2px 8px; border: 1px solid ${isDanger ? '#fca5a5' : 'var(--border)'}; border-radius: 4px; cursor: pointer;`;
            btn.textContent = label;
            btn.onclick = onClick;
            return btn;
        }

        function makeInlineEditForm(formId, initial, onSave, onCancel) {
            const wrap = document.createElement('div');
            wrap.id = formId;
            wrap.style.display = 'none';
            const ta = document.createElement('textarea');
            ta.id = formId + '-ta';
            ta.value = initial;
            ta.rows = 3;
            ta.style.cssText = 'width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit; resize: vertical; box-sizing: border-box; margin-bottom: 8px;';
            const actions = document.createElement('div');
            actions.style.textAlign = 'right';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-outline';
            cancelBtn.style.cssText = 'font-size: 0.82rem; padding: 5px 13px; margin-right: 8px; color: var(--text-sub); border-color: var(--border);';
            cancelBtn.textContent = '취소';
            cancelBtn.onclick = onCancel;
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn';
            saveBtn.style.cssText = 'font-size: 0.82rem; padding: 5px 13px;';
            saveBtn.textContent = '저장';
            saveBtn.onclick = onSave;
            actions.appendChild(cancelBtn);
            actions.appendChild(saveBtn);
            wrap.appendChild(ta);
            wrap.appendChild(actions);
            return wrap;
        }

        function toggleInlineEdit(type, id, content) {
            const contentEl = document.getElementById(`${type}-content-${id}`);
            const editForm  = document.getElementById(`${type}-edit-${id}`);
            if (!editForm || !contentEl) return;
            const opening = editForm.style.display === 'none';
            if (opening) {
                const ta = document.getElementById(`${type}-edit-${id}-ta`);
                if (ta && content !== undefined) ta.value = content;
                contentEl.style.display = 'none';
                editForm.style.display = 'block';
            } else {
                contentEl.style.display = 'block';
                editForm.style.display = 'none';
            }
        }

        function renderStudentReplies(studentReplies) {
            const container = document.getElementById('student-reply-display');
            if (!container) return;
            container.innerHTML = '';

            if (!studentReplies || studentReplies.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';

            studentReplies.forEach(reply => {
                // 학생 코멘트 카드
                const card = document.createElement('div');
                card.style.cssText = 'background: rgba(255,255,255,0.72); border-left: 3px solid var(--primary); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px;';

                // 헤더
                const header = document.createElement('div');
                header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
                const label = document.createElement('strong');
                label.style.cssText = 'color: var(--primary); font-size: 0.9rem;';
                label.innerHTML = `<i class="fa-solid fa-reply"></i> 학생 코멘트 (${reply.name})`;
                const sBtns = document.createElement('div');
                sBtns.style.cssText = 'display: flex; gap: 5px;';
                if (currentRole === 'student' && reply.name === currentUserName) {
                    sBtns.appendChild(makeSmallBtn('수정', false, () => toggleInlineEdit('s', reply._id, reply.content)));
                    sBtns.appendChild(makeSmallBtn('삭제', true,  () => deleteStudentReply(currentWeek, reply._id)));
                }
                header.appendChild(label);
                header.appendChild(sBtns);

                // 본문
                const contentEl = document.createElement('p');
                contentEl.id = `s-content-${reply._id}`;
                contentEl.style.cssText = 'margin: 0 0 6px 0; font-size: 0.95rem; color: #333; line-height: 1.5;';
                contentEl.textContent = reply.content;

                // 인라인 수정 폼
                const editForm = makeInlineEditForm(
                    `s-edit-${reply._id}`, reply.content,
                    () => saveStudentReply(currentWeek, reply._id),
                    () => toggleInlineEdit('s', reply._id)
                );

                // 교수 답글 영역
                const profSection = document.createElement('div');
                profSection.style.cssText = 'margin-top: 10px; padding-left: 12px; border-left: 2px solid #bbf7d0;';

                (reply.profReplies || []).forEach(pr => {
                    const prCard = document.createElement('div');
                    prCard.style.cssText = 'background: #f0fdf4; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;';

                    const prHeader = document.createElement('div');
                    prHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;';
                    const prLabel = document.createElement('strong');
                    prLabel.style.cssText = 'color: #166534; font-size: 0.85rem;';
                    prLabel.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> 교수 답글 (${pr.name})`;
                    const prBtns = document.createElement('div');
                    prBtns.style.cssText = 'display: flex; gap: 5px;';
                    if (currentRole === 'prof') {
                        prBtns.appendChild(makeSmallBtn('수정', false, () => toggleInlineEdit('p', pr._id, pr.content)));
                        prBtns.appendChild(makeSmallBtn('삭제', true,  () => deleteProfReply(currentWeek, reply._id, pr._id)));
                    }
                    prHeader.appendChild(prLabel);
                    prHeader.appendChild(prBtns);

                    const prContent = document.createElement('p');
                    prContent.id = `p-content-${pr._id}`;
                    prContent.style.cssText = 'margin: 0; font-size: 0.9rem; color: #14532d; line-height: 1.5;';
                    prContent.textContent = pr.content;

                    const prEditForm = makeInlineEditForm(
                        `p-edit-${pr._id}`, pr.content,
                        () => saveProfReply(currentWeek, reply._id, pr._id),
                        () => toggleInlineEdit('p', pr._id)
                    );

                    prCard.appendChild(prHeader);
                    prCard.appendChild(prContent);
                    prCard.appendChild(prEditForm);
                    profSection.appendChild(prCard);
                });

                // 교수 답글 달기 버튼 + 폼
                if (currentRole === 'prof') {
                    const addBtn = document.createElement('button');
                    addBtn.style.cssText = 'background: none; color: #166534; font-size: 0.85rem; padding: 5px 10px; border: 1px solid #bbf7d0; border-radius: 5px; margin-top: 6px; cursor: pointer;';
                    addBtn.innerHTML = '<i class="fa-solid fa-reply"></i> 이 코멘트에 답글 달기';
                    addBtn.onclick = () => {
                        const f = document.getElementById(`prf-form-${reply._id}`);
                        f.style.display = f.style.display === 'none' ? 'block' : 'none';
                    };

                    const prfForm = document.createElement('div');
                    prfForm.id = `prf-form-${reply._id}`;
                    prfForm.style.cssText = 'display: none; margin-top: 10px;';

                    const prfTA = document.createElement('textarea');
                    prfTA.id = `prf-ta-${reply._id}`;
                    prfTA.placeholder = '이 학생 코멘트에 대한 답글을 작성하세요.';
                    prfTA.rows = 3;
                    prfTA.style.cssText = 'width: 100%; padding: 10px; border: 1px solid #bbf7d0; border-radius: 6px; font-family: inherit; resize: vertical; box-sizing: border-box; margin-bottom: 8px;';

                    const prfActions = document.createElement('div');
                    prfActions.style.textAlign = 'right';
                    const prfCancel = document.createElement('button');
                    prfCancel.className = 'btn btn-outline';
                    prfCancel.style.cssText = 'font-size: 0.82rem; padding: 5px 13px; margin-right: 8px; color: var(--text-sub); border-color: var(--border);';
                    prfCancel.textContent = '취소';
                    prfCancel.onclick = () => { prfForm.style.display = 'none'; prfTA.value = ''; };
                    const prfSubmit = document.createElement('button');
                    prfSubmit.className = 'btn';
                    prfSubmit.style.cssText = 'background: #166534; font-size: 0.82rem; padding: 5px 13px;';
                    prfSubmit.textContent = '답글 등록';
                    prfSubmit.onclick = () => submitProfReply(reply._id);
                    prfActions.appendChild(prfCancel);
                    prfActions.appendChild(prfSubmit);
                    prfForm.appendChild(prfTA);
                    prfForm.appendChild(prfActions);

                    profSection.appendChild(addBtn);
                    profSection.appendChild(prfForm);
                }

                card.appendChild(header);
                card.appendChild(contentEl);
                card.appendChild(editForm);
                card.appendChild(profSection);
                container.appendChild(card);
            });
        }

        // 학생 코멘트 수정 저장
        async function saveStudentReply(weekNum, replyId) {
            const ta = document.getElementById(`s-edit-${replyId}-ta`);
            if (!ta) return;
            const newContent = ta.value.trim();
            if (!newContent) { alert('내용을 입력해주세요.'); return; }
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent, courseId: currentCourse?._id, groupId: currentGroup?._id })
                });
                if (res.ok) loadReportData(weekNum);
                else alert('수정에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 학생 코멘트 삭제
        async function deleteStudentReply(weekNum, replyId) {
            if (!confirm('이 코멘트를 삭제하시겠습니까?')) return;
            try {
                const params = new URLSearchParams();
                if (currentCourse?._id) params.set('courseId', currentCourse._id);
                if (currentGroup?._id)  params.set('groupId',  currentGroup._id);
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}?${params}`, { method: 'DELETE' });
                if (res.ok) loadReportData(weekNum);
                else alert('삭제에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 교수 답글 등록 (특정 코멘트)
        async function submitProfReply(replyId) {
            const ta = document.getElementById(`prf-ta-${replyId}`);
            if (!ta) return;
            const text = ta.value.trim();
            if (!text) { alert('답글 내용을 입력해주세요.'); return; }
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/${currentWeek}/reply/${replyId}/prof-reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text, name: currentUserName, courseId: currentCourse?._id, groupId: currentGroup?._id })
                });
                if (res.ok) {
                    ta.value = '';
                    document.getElementById(`prf-form-${replyId}`).style.display = 'none';
                    loadReportData(currentWeek);
                } else {
                    alert('답글 등록에 실패했습니다.');
                }
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 교수 답글 수정 저장
        async function saveProfReply(weekNum, replyId, profReplyId) {
            const ta = document.getElementById(`p-edit-${profReplyId}-ta`);
            if (!ta) return;
            const newContent = ta.value.trim();
            if (!newContent) { alert('내용을 입력해주세요.'); return; }
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}/prof-reply/${profReplyId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent, courseId: currentCourse?._id, groupId: currentGroup?._id })
                });
                if (res.ok) loadReportData(weekNum);
                else alert('수정에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 교수 답글 삭제
        async function deleteProfReply(weekNum, replyId, profReplyId) {
            if (!confirm('이 답글을 삭제하시겠습니까?')) return;
            try {
                const params = new URLSearchParams();
                if (currentCourse?._id) params.set('courseId', currentCourse._id);
                if (currentGroup?._id)  params.set('groupId',  currentGroup._id);
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}/prof-reply/${profReplyId}?${params}`, { method: 'DELETE' });
                if (res.ok) loadReportData(weekNum);
                else alert('삭제에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 마일스톤 폭죽 연출 및 토큰 획득
        function triggerConfetti() {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            syncTokensWithDB(userTokens + 50);
            setTimeout(() => alert("🎉 마일스톤 업데이트 완료! (+50 토큰 획득)"), 500);
        }

        // 토큰 사용 로직
        function unlockReference() {
            if(confirm("🪙 50 토큰을 사용하여 [Refresh Token 구현 사례]를 열람하시겠습니까?")) {
                syncTokensWithDB(userTokens - 50);
                document.getElementById('unlock-btn').style.display = 'none';
                document.getElementById('unlocked-content').style.display = 'block';
            }
        }
        
        async function uploadProfessorFile(inputElement) {
            const file = inputElement.files[0];
            if (!file) return;

            if (!currentCourse) {
                alert('과목을 먼저 선택해주세요.\n"나의 과목"에서 과목에 진입한 후 이 메뉴를 이용해 주세요.');
                inputElement.value = '';
                return;
            }

            const weekInput = document.getElementById('upload-week-num');
            const week = weekInput ? parseInt(weekInput.value) : 1;
            if (!week || week < 1 || week > 30) {
                alert('올바른 주차 번호를 입력해주세요. (1~30)');
                inputElement.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('courseId', currentCourse._id);

            try {
                const response = await fetch(`${SERVER_URL}/api/upload-criteria/${week}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || "서버 응답 오류");
                }

                const data = await response.json();
                alert(`업로드 완료!\n파일명: ${data.criteria.fileName}\n${week}주차 AI 피드백 기준으로 등록되었습니다.`);
                loadCriteriaList();
            } catch (error) {
                console.error("파일 업로드 실패:", error);
                alert(`파일 업로드 실패: ${error.message}`);
            }
            inputElement.value = '';
        }

// 업로드된 자료 목록을 가져와서 UI에 표시
async function loadCriteriaList() {
    const listContainer = document.getElementById('criteria-list-container');
    if (!listContainer) return;

    // 과목 이름 표시 및 미선택 상태 처리
    const courseNameEl  = document.getElementById('ai-upload-course-name');
    const noCourseEl    = document.getElementById('ai-upload-no-course');
    const contentEl     = document.getElementById('ai-upload-content');

    if (!currentCourse) {
        if (courseNameEl) courseNameEl.textContent = '과목 미선택';
        if (noCourseEl)   noCourseEl.style.display  = 'block';
        if (contentEl)    contentEl.style.display    = 'none';
        return;
    }

    if (courseNameEl) courseNameEl.textContent = currentCourse.title;
    if (noCourseEl)   noCourseEl.style.display  = 'none';
    if (contentEl)    contentEl.style.display    = 'block';

    listContainer.innerHTML = '<p style="color:#94a3b8;text-align:center;font-size:0.9rem;">불러오는 중...</p>';

    try {
        const res  = await fetch(`${SERVER_URL}/api/upload-criteria?courseId=${currentCourse._id}`);
        const data = await res.json();

        if (data.length === 0) {
            listContainer.innerHTML = '<p style="color:#94a3b8;text-align:center;font-size:0.9rem;margin:10px 0;">이 과목에 업로드된 자료가 없습니다.</p>';
            return;
        }

        listContainer.innerHTML = data.map(item => `
            <div style="background:white; padding:12px 15px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <div style="flex:1; min-width:0; display:flex; align-items:center; margin-right:10px;">
                    <span style="color:#6b21a8; font-weight:bold; margin-right:10px; white-space:nowrap; background:#f5f3ff; padding:3px 10px; border-radius:12px; font-size:0.85rem;">${item.week}주차</span>
                    <span style="color:#1e293b; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.fileName}">${item.fileName}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:600; white-space:nowrap;"><i class="fa-solid fa-check"></i> 학습 완료</span>
                    <button onclick="deleteCriteria('${item._id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:4px; font-size:0.9rem;" title="삭제">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error("목록 로드 실패:", error);
        listContainer.innerHTML = '<p style="color:#ef4444;text-align:center;font-size:0.9rem;">목록을 불러오지 못했습니다.</p>';
    }
}

// [신규] 업로드된 자료 삭제 함수
async function deleteCriteria(id) {
    if (!confirm("이 자료를 삭제하시겠습니까? 삭제 시 해당 주차의 AI 피드백 기준에서 제외됩니다.")) return;

    try {
        const res = await fetch(`${SERVER_URL}/api/upload-criteria/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            alert("자료가 삭제되었습니다.");
            loadCriteriaList(); // 목록 새로고침
        } else {
            const error = await res.text();
            alert("삭제 실패: " + error);
        }
    } catch (error) {
        console.error("삭제 중 오류 발생:", error);
        alert("삭제 작업 중 오류가 발생했습니다.");
    }
}