        let currentRole = '';
        let currentUserId = 'student_01';
        let currentUserName = '';
        let currentCourse = null;
        let userTokens = 320; // 기본 학생 토큰
        let mvpTokens = 500; // 이달의 MVP 기준 토큰 (예시 초기값)
        let mvpUserName = '김철수'; // 이달의 MVP 이름 (예시 초기값)

        // 서버 주소 설정 (포트 번호 확인)
        const SERVER_URL = 'http://localhost:8080';

        // 🌟 [추가] 1. 초기 로딩 시 기본 상태(로그인 화면)를 History에 저장
        history.replaceState({ viewId: 'view-login' }, "", "#view-login");

        // 🌟 [수정] 2. 뷰 전환 시 History API를 활용하여 상태 기록
        function showView(viewId, pushToHistory = true) {
            document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
            
            const targetView = document.getElementById(viewId);
            if (targetView) targetView.classList.add('active');
            
            window.scrollTo(0, 0);

            // History에 상태 추가
            if (pushToHistory) {
                history.pushState({ viewId: viewId }, "", "#" + viewId);
            }
        }

        // 🌟 [추가] 3. 브라우저 뒤로가기/앞으로가기 이벤트(popstate) 감지 처리
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
                    } else if (viewId === 'view-prof-dashboard' || viewId === 'view-student-dashboard' || viewId === 'view-team-detail') {
                        document.getElementById('menu-team-home').classList.add('active');
                    } else if (viewId === 'view-ai-upload') {
                        document.getElementById('menu-ai-upload').classList.add('active');
                    }

                    showView(viewId, false); // 히스토리에 다시 푸시하지 않고 뷰만 전환
                }
            }
        });

        // 🌟 [수정] 로그인/회원가입 뷰 전환 시 History 기록 추가
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

        // [추가] DB에서 최신 MVP 정보를 가져와 UI 업데이트
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

        // [추가] 토큰 변경 시 DB에 저장하고 MVP 정보 갱신
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
// 회원가입 처리 (이름 및 역할 전송 버전으로 수정 🌟)
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

// 로그인 분기 처리 (학번/비밀번호 전송 버전 🌟)
// 로그인 처리 함수 (수정 완료 🌟)
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

        document.getElementById('menu-ai-upload').style.display = 'flex';
        document.getElementById('student-milestone-btn').style.display = 'none';
        document.getElementById('unlock-btn').style.display = 'none';
        document.getElementById('unlocked-content').style.display = 'block';
        document.getElementById('btn-edit-report').style.display = 'none';

        document.getElementById('prof-ai-generate-form').style.display = 'block';
        document.getElementById('student-reply-wrapper').style.display = 'block';
    } else {
        document.getElementById('user-info').innerText = userData.name || '학생';
        document.getElementById('nav-tokens').style.display = 'inline-block';

        document.getElementById('menu-ai-upload').style.display = 'none';
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
            document.getElementById('main-nav').style.display = 'none';
            document.getElementById('app-body').style.display = 'none';

            document.getElementById('view-login').style.display = '';
            document.getElementById('view-signup').style.display = '';

            toggleAuthView('login');
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
            document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active'));
            document.getElementById('menu-team-home').classList.add('active');

            if (currentRole === 'prof') {
                showView('view-prof-dashboard');
                loadOverallSummary(); // 교수 대시보드 진입 시 전체 요약 로드
                loadTotalTokens();    // 교수 대시보드 진입 시 누적 토큰 로드
            } else {
                showView('view-student-dashboard');
            }
        }

        // [추가] 전체 누적 토큰 양 가져오기
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

        // 🌟 [추가] AI 주차별 진행 상황 전체 분석 요약 가져오기
        async function loadOverallSummary() {
            const summaryEl = document.getElementById('ai-overall-summary-text');
            if (!summaryEl) return;
            
            summaryEl.innerText = "데이터를 분석 중입니다...";
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/overall-summary`);
                const data = await res.json();
                summaryEl.innerText = data.summary;
            } catch (error) {
                summaryEl.innerText = "요약을 불러오는 데 실패했습니다.";
            }
        }

        // 팀 상세 페이지 진입 
        function showTeamDetail() {
            showView('view-team-detail');
        }
        
        // 🌟 [수정] 내부 뒤로가기 버튼 역시 브라우저 History 제어를 따르도록 수정
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

// prolync.js 에 추가 또는 기존 saveReport 수정

// 주차 데이터 제어를 위한 전역 변수 (기본값 1주차)
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
                authorId: currentUserId
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

// 화면이 처음 켜지거나 조가 선택되었을 때 기존 데이터를 가져와서 뿌려주는 함수도 추가하면 좋습니다.
async function loadReportData(week) {
    currentWeek = week;
    try {
        const res = await fetch(`${SERVER_URL}/api/reports/${week}`);
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
            await fetch(`${SERVER_URL}/api/reports/${currentWeek}/ai-feedback`, { method: 'PATCH' });
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
                body: JSON.stringify({ reply: text, name: currentUserName })
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
                    body: JSON.stringify({ content: newContent })
                });
                if (res.ok) loadReportData(weekNum);
                else alert('수정에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 학생 코멘트 삭제
        async function deleteStudentReply(weekNum, replyId) {
            if (!confirm('이 코멘트를 삭제하시겠습니까?')) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}`, { method: 'DELETE' });
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
                    body: JSON.stringify({ content: text, name: currentUserName })
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
                    body: JSON.stringify({ content: newContent })
                });
                if (res.ok) loadReportData(weekNum);
                else alert('수정에 실패했습니다.');
            } catch { alert('서버 오류가 발생했습니다.'); }
        }

        // 교수 답글 삭제
        async function deleteProfReply(weekNum, replyId, profReplyId) {
            if (!confirm('이 답글을 삭제하시겠습니까?')) return;
            try {
                const res = await fetch(`${SERVER_URL}/api/reports/${weekNum}/reply/${replyId}/prof-reply/${profReplyId}`, { method: 'DELETE' });
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
        
// prolync.js에 추가할 파일 전송 함수
async function uploadProfessorFile(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        // 우선은 샘플로 1주차 기준 업로드 진행
        const res = await fetch(`${SERVER_URL}/api/upload-criteria/1`, {
            method: 'POST',
            body: formData // 파일 전송시에는 Headers에 Content-Type을 명시하지 않는 것이 좋습니다 (자동 세팅)
        });
        
        const data = await res.json();
        alert(`🎉 ${data.message}\n학습된 파일명: ${data.criteria.fileName}`);
        
        // 성공 후 화면을 새로고침 하거나 목록을 업데이트하는 로직을 추가할 수 있습니다.
    } catch (error) {
        console.error("파일 업로드 실패:", error);
        alert("파일을 업로드하는 중 오류가 발생했습니다.");
    }
}