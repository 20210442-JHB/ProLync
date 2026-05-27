        let currentRole = '';
        let currentUserId = 'student_01'; // 예시 ID
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
        async function processSignup() {
            const userId = document.getElementById('signup-id').value.trim();
            const password = document.getElementById('signup-pw').value.trim();

            if(!userId || !password) {
                alert("아이디와 비밀번호를 모두 입력해주세요.");
                return;
            }

            try {
                const res = await fetch(`${SERVER_URL}/api/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, password })
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

        // 로그인 분기 처리
        async function login(role) {
            currentRole = role;
            const name = role === 'prof' ? '성보경 교수' : '조현빈 학생';
            currentUserId = role === 'prof' ? 'prof_01' : 'student_01';

            let userData;

            try {
                // 서버에 유저 정보 확인/생성 요청
                const res = await fetch(`${SERVER_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUserId, name, role })
                });
                userData = await res.json();
                userTokens = userData.tokens;
            } catch (error) {
                console.error("Connection Error:", error);
                alert("서버와 통신할 수 없습니다. Node.js 서버가 8080번 포트에서 실행 중인지 확인하세요.");
                return;
            }

            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-signup').style.display = 'none';
            
            document.getElementById('main-nav').style.display = 'flex';
            document.getElementById('app-body').style.display = 'flex';
            
            if(role === 'prof') {
                document.getElementById('user-info').innerText = userData.name;
                document.getElementById('nav-tokens').style.display = 'none';
                
                document.getElementById('menu-ai-upload').style.display = 'flex'; 
                document.getElementById('student-milestone-btn').style.display = 'none';
                document.getElementById('unlock-btn').style.display = 'none';
                document.getElementById('unlocked-content').style.display = 'block'; 
                document.getElementById('btn-edit-report').style.display = 'none'; 
                
                document.getElementById('prof-ai-generate-form').style.display = 'block';
                document.getElementById('student-reply-wrapper').style.display = 'block'; 
            } else {
                document.getElementById('user-info').innerText = userData.name;
                document.getElementById('nav-tokens').style.display = 'inline-block';
                
                document.getElementById('menu-ai-upload').style.display = 'none'; 
                document.getElementById('student-milestone-btn').style.display = 'block';
                document.getElementById('unlock-btn').style.display = 'flex';
                document.getElementById('unlocked-content').style.display = 'none';
                document.getElementById('btn-edit-report').style.display = 'block'; 
                
                document.getElementById('prof-ai-generate-form').style.display = 'none';
                document.getElementById('student-reply-wrapper').style.display = 'block'; 
            }

            updateTokenDisplay();
            refreshMVP(); // 모든 역할(교수/학생)에서 MVP 정보 로드
            loadReportData(1); // 1주차 데이터 로드
            
            document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active'));
            document.getElementById('menu-team-home').classList.add('active');
            
            // 로그인 완료 후 기본 대시보드 뷰 호출 (여기서 History 푸시 발생)
            showView('view-course-list');
        }

        // 로그아웃 처리
        function logout() {
            currentRole = '';
            document.getElementById('main-nav').style.display = 'none';
            document.getElementById('app-body').style.display = 'none';

            document.getElementById('view-login').style.display = '';
            document.getElementById('view-signup').style.display = '';
            
            // 로그아웃 시 History에도 로그인 상태 기록 추가
            toggleAuthView('login');
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

        async function saveReport() {
            const title = document.getElementById('edit-title').value;
            const content = document.getElementById('edit-content').value;

            await fetch(`${SERVER_URL}/api/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week: 1, title, content, authorId: currentUserId })
            });

            alert("보고서가 DB에 저장되었습니다.");
            loadReportData(1);
            toggleEditMode();
        }

        async function loadReportData(week) {
            const res = await fetch(`${SERVER_URL}/api/reports/${week}`);
            const data = await res.json();
            if (data.title) {
                document.getElementById('display-title').innerText = data.title;
                document.getElementById('display-content').innerText = data.content;
                if (data.studentReply) {
                    document.getElementById('student-reply-form').style.display = 'none';
                    document.getElementById('student-reply-display').style.display = 'block';
                    document.getElementById('student-reply-text').innerText = data.studentReply;
                }
            }
        }

        // AI 피드백 자동 생성
        async function generateAIFeedback() {
            await fetch(`${SERVER_URL}/api/reports/1/ai-feedback`, { method: 'PATCH' });
            alert("AI 피드백이 생성되어 DB에 반영되었습니다.");
            loadReportData(1);
        }

        // 피드백 답변 등록 기능
        async function submitStudentReply() {
            const text = document.getElementById('reply-textarea').value.trim();
            if (!text) {
                alert("답변 내용을 입력해주세요.");
                return;
            }

            await fetch(`${SERVER_URL}/api/reports/1/reply`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reply: text })
            });

            alert("답변이 등록되었습니다.");
            loadReportData(1);
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