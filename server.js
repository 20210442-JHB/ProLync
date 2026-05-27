const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
// 🌟 [수정 버전] 이렇게 변경해 주세요!
// 🌟 [최종 대안] 위 코드로 안 될 경우 이 방식으로 작성하세요.
const pdfParse = require('pdf-parse');
const fs = require('fs');

// 업로드 폴더가 없으면 생성
if (!fs.existsSync('uploads/')) {
    fs.mkdirSync('uploads/');
}

// 업로드된 파일이 임시로 저장될 폴더 설정 및 파일명 인코딩 처리
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // 파일이 저장될 경로
  },
  filename: function (req, file, cb) {
    // 파일명에 한글 등 비ASCII 문자가 깨지는 현상 방지
    // originalname이 latin1으로 잘못 해석되었을 경우를 대비하여 UTF-8로 재인코딩 시도
    try {
        const decodedName = Buffer.from(file.originalname, 'binary').toString('utf8');
        cb(null, Date.now() + '-' + decodedName);
    } catch (e) {
        cb(null, Date.now() + '-' + file.originalname);
    }
  }
});

const upload = multer({ storage: storage });
const app = express();
const PORT = 8080;

// Middleware
app.use(express.json());
app.use(cors());
// 모든 요청에 대해 로그 출력 (연결 확인용)
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});
app.use(express.static(__dirname));

// MongoDB Connection (로컬 DB 사용 예시)
//mongoose.connect('mongodb://127.0.0.1:27017/prolync')
// 개인 클라우드 DB 연결 (변경)
// 특수문자(~)를 URL 인코딩(%7E) 처리했습니다.
// 데이터베이스 이름을 'prolync'로 명시하여 test DB가 아닌 전용 DB를 사용하게 합니다.
const db_uri = 'mongodb://habin:habin11013%7E@ac-wc2syqe-shard-00-00.9w4124b.mongodb.net:27017,ac-wc2syqe-shard-00-01.9w4124b.mongodb.net:27017,ac-wc2syqe-shard-00-02.9w4124b.mongodb.net:27017/prolync?ssl=true&replicaSet=atlas-romarc-shard-0&authSource=admin&appName=Cluster0';

mongoose.connect(db_uri)
  .then(() => {
    console.log('개인 클라우드 MongoDB Connected...');
    // 모델이 로드된 후 인덱스를 명시적으로 삭제 시도
    mongoose.connection.once('open', async () => {
        try {
            // Mongoose는 모델 이름 'Criteria'를 자동으로 복수형인 'criterias' 컬렉션으로 만듭니다.
            // 기존에 생성된 'week_1' 유니크 인덱스를 제거합니다.
            await mongoose.connection.db.collection('criterias').dropIndex('week_1');
            console.log("기존 unique 인덱스(criterias.week_1)를 성공적으로 삭제했습니다.");
        } catch (e) {
            console.log("유니크 인덱스가 이미 없거나 삭제할 필요가 없습니다.");
        }
    });
  })
  .catch(err => {
    console.error('!!! MongoDB 연결 실패 !!!');
    console.error(err);
  });

// Schemas
const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    role: String,
    tokens: { type: Number, default: 320 }
});

const ReportSchema = new mongoose.Schema({
    week: Number,
    title: String,
    content: String,
    authorId: String,
    aiFeedback: String,
    studentReply: String,
    isLocked: { type: Boolean, default: true }
});

const User = mongoose.model('User', UserSchema);
const Report = mongoose.model('Report', ReportSchema);

// 교수자가 업로드한 주차별 피드백 기준 자료 스키마
const CriteriaSchema = new mongoose.Schema({
    week: { type: Number, required: true }, // [수정] 여러 파일 업로드를 위해 unique 제약 제거
    fileName: String,
    extractedText: String, // 파일에서 긁어온 실제 텍스트 내용 🌟
    updatedAt: { type: Date, default: Date.now }
});

const Criteria = mongoose.model('Criteria', CriteriaSchema);

// API Routes


// 0. 메인 화면 접속 시 index.html 띄우기
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1-1. 회원가입 처리 API (이름, 역할 연동 완료 🌟)
app.post('/api/signup', async (req, res) => {
    const { userId, password, name, role } = req.body; 
    try {
        const existingUser = await User.findOne({ userId });
        if (existingUser) {
            return res.status(400).json({ message: "이미 존재하는 학번/교번입니다." });
        }

        const newUser = new User({
            userId,
            password, 
            name: name || "신규 가입자", 
            role: role || "student", 
            tokens: role === 'prof' ? 0 : 320 
        });

        await newUser.save();
        res.json({ message: "회원가입이 완료되었습니다! 로그인해 주세요." });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 1-2. 사용자 로그인 검증 및 데이터 조회 (업그레이드 버전 🌟)
app.post('/api/login', async (req, res) => {
    const { userId, password, role } = req.body;
    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(401).json({ message: "존재하지 않는 학번 또는 교번입니다." });
        }
        if (user.password !== password) {
            return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
        }
        if (user.role !== role) {
            return res.status(403).json({ message: "선택하신 회원 유형(학생/교수)이 일치하지 않습니다." });
        }
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// [추가] 특정 사용자의 토큰 업데이트 API
app.patch('/api/users/:userId/tokens', async (req, res) => {
    const { userId } = req.params;
    const { tokens } = req.body;
    try {
        const user = await User.findOneAndUpdate(
            { userId },
            { tokens },
            { new: true, upsert: true }
        );
        res.json(user);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// [추가] 최다 토큰 보유 MVP 조회 API
app.get('/api/users/mvp', async (req, res) => {
    try {
        const topUser = await User.findOne().sort({ tokens: -1 });
        res.json(topUser || { name: '없음', tokens: 0 });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// [추가] 모든 사용자의 누적 토큰 합계 조회 API
app.get('/api/users/total-tokens', async (req, res) => {
    try {
        const result = await User.aggregate([
            { $group: { _id: null, total: { $sum: "$tokens" } } }
        ]);
        res.json({ totalTokens: result.length > 0 ? result[0].total : 0 });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 2. 특정 주차 보고서 및 피드백 조회 (중복 제거 및 404 예외 처리 통합 🌟)
app.get('/api/reports/:week', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        const report = await Report.findOne({ week: weekNum });
        if (!report) {
            return res.status(404).json({ message: "해당 주차의 제출된 보고서가 없습니다." });
        }
        res.json(report);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// [추가] 교수자가 업로드한 모든 주차별 기준 자료 목록 조회 API
app.get('/api/upload-criteria', async (req, res) => {
    try {
        const allCriteria = await Criteria.find({}).sort({ week: 1 });
        res.json(allCriteria);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// [추가] 업로드된 기준 자료 삭제 API
app.delete('/api/upload-criteria/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // 1. 유효하지 않은 ObjectId 형식 체크
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.warn(`[DELETE] 유효하지 않은 ObjectId 형식: ${id}`);
            return res.status(400).send("유효하지 않은 자료 ID 형식입니다.");
        }

        const deletedCriteria = await Criteria.findByIdAndDelete(id);

        // 2. 삭제할 자료를 찾을 수 없는 경우
        if (!deletedCriteria) {
            console.warn(`[DELETE] ID ${id}를 가진 자료를 찾을 수 없습니다.`);
            return res.status(404).send("삭제할 자료를 찾을 수 없습니다.");
        }

        console.log(`[DELETE] ID ${id} 자료가 성공적으로 삭제되었습니다.`);
        res.json({ message: "자료가 성공적으로 삭제되었습니다." });
    } catch (err) {
        console.error("자료 삭제 중 서버 에러 발생:", err); // 상세 에러 로그
        res.status(500).send(`서버 오류: ${err.message}`); // 클라이언트에 더 명확한 메시지 전달
    }
});

// 3. 교수용: 강의자료/루브릭 파일 업로드 및 텍스트 학습 API
app.post('/api/upload-criteria/:week', upload.single('file'), async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        if (!req.file) {
            return res.status(400).send("업로드된 파일이 없습니다.");
        }

        // 파일명 인코딩 해결 (latin1 대신 binary로 시도하여 더 범용적으로 대응)
        let safeFileName = req.file.originalname;
        try {
            safeFileName = Buffer.from(req.file.originalname, 'binary').toString('utf8');
        } catch (e) {
            console.error("파일명 디코딩 실패:", e);
        }

        console.log(`[파일 업로드] 주차: ${weekNum}, 파일명: ${safeFileName}`);
        let extractedText = "";

        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(req.file.path);
            try {
                const pdfData = await pdfParse(dataBuffer);
                extractedText = pdfData.text; 
            } catch (pdfErr) {
                console.error("PDF 파싱 중 에러 발생:", pdfErr);
                throw new Error("PDF 파일 분석에 실패했습니다.");
            }
        } else if (req.file.mimetype.includes('spreadsheet') || req.file.originalname.endsWith('.xlsx')) {
            extractedText = `[엑셀 파일 업로드됨: ${req.file.originalname}] 이 파일은 채점 루브릭 기준으로 사용됩니다.`;
        } else {
            extractedText = fs.readFileSync(req.file.path, 'utf8');
        }

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // [수정] findOneAndUpdate 대신 new Criteria().save()를 사용하여 다중 파일 허용
        const criteria = new Criteria({
            week: weekNum,
            fileName: safeFileName,
            extractedText: extractedText,
            updatedAt: new Date()
        });
        await criteria.save();

        res.json({ message: "성공적으로 파일을 학습했습니다.", criteria });
    } catch (err) {
        console.error("파일 업로드 최종 실패 로그:", err);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).send(err.message);
    }
});

// 4. AI 피드백 생성 (교수용 수동 재발행 버전)
app.patch('/api/reports/:week/ai-feedback', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        const report = await Report.findOne({ week: weekNum });
        if (!report || !report.content) {
            return res.status(404).send("분석할 학생 보고서가 없습니다.");
        }

        // [수정] 해당 주차의 모든 자료를 가져와서 합칩니다.
        const allCriteria = await Criteria.find({ week: weekNum });
        let professorRubric = "제공된 별도의 루브릭이 없습니다. 일반적인 대학 과제 기준으로 평가하세요.";
        
        if (allCriteria.length > 0) {
            professorRubric = allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n");
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `당신은 대학 교수님의 평가 기조를 완벽히 대변하는 AI 튜터입니다.
                    아래 제공되는 [교수님의 채점 루브릭 및 강의 자료]를 철저히 학습하고, 이 기준에 맞추어 학생의 보고서를 평가해야 합니다.
                    기준에 부합하는 부분은 칭찬하고, 미진한 부분은 구체적인 개선 방향을 제시하여 3줄 내외로 친절하고 전문적으로 피드백해 주세요.

                    [교수님의 채점 루브릭 및 강의 자료]:
                    ${professorRubric}` 
                },
                { 
                    role: "user", 
                    content: `학생 보고서 제목: ${report.title}\n본문 내용: ${report.content}` 
                }
            ],
        });

        const aiResponse = completion.choices[0].message.content;
        const updatedReport = await Report.findOneAndUpdate(
            { week: weekNum },
            { aiFeedback: aiResponse },
            { new: true }
        );

        res.json(updatedReport);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 5. [통합 및 중략 복구 🌟] 학생 보고서 제출 및 실시간 AI 자동 피드백 생성 API 
app.post('/api/reports/submit', async (req, res) => {
    const { week, title, content, authorId } = req.body;
    try {
        // [수정] 해당 주차의 모든 자료를 검색
        const allCriteria = await Criteria.find({ week: parseInt(week) });
        let criteriaText = "제공된 별도의 교수자 평가 기준이 없습니다. 일반적인 대학 프로젝트 기준에서 피드백해 주세요.";
        if (allCriteria.length > 0) {
            criteriaText = allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n");
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `당신은 대학 강의의 전담 AI 튜터입니다. 
                    교수님이 업로드하신 [교수자 평가 기준 및 강의 자료]를 철저히 바탕으로, 학생이 제출한 [주차별 결과물]을 분석하세요.
                    학생의 기획 명확성, 발전 가능성을 칭찬하되, 교수님의 평가 기준에 비추어 부족한 점이나 다음 주차에 '반드시 반영해야 할 구체적인 기술/기획적 보완점'을 친절하고 건설적인 어조로 2~3문장 내외로 요약하여 피드백하세요.`
                },
                {
                    role: "user",
                    content: `[교수자 평가 기준 및 강의 내용]:\n${criteriaText}\n\n[학생 제출 결과물]:\n주차: ${week}주차\n제목: ${title}\n내용: ${content}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const generatedFeedback = response.choices[0].message.content;

        // 기존의 단순 저장 로직(app.post('/api/reports'))을 흡수하여 하나로 통합 저장합니다.
        const updatedReport = await Report.findOneAndUpdate(
            { week: parseInt(week) },
            { title, content, authorId, aiFeedback: generatedFeedback },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: "보고서가 제출되었으며, AI 피드백이 성공적으로 생성되었습니다.",
            report: updatedReport
        });
    } catch (error) {
        console.error("AI 피드백 생성 중 서버 에러 발생:", error);
        res.status(500).json({ success: false, error: "AI 피드백을 생성하는 중 오류가 발생했습니다." });
    }
});

// [추가] 특정 주차의 보고서 및 피드백을 불러오는 GET API (화면 초기 로딩용)
app.get('/api/reports/:week', async (req, res) => {
    try {
        const report = await Report.findOne({ week: parseInt(req.params.week) });
        if (!report) {
            return res.status(404).json({ message: "해당 주차의 제출된 보고서가 없습니다." });
        }
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: "데이터 로딩 실패" });
    }
});

// 4. [신규] 주차별 진행 상황 전체 분석 요약 (교수용) 🌟
app.get('/api/reports/overall-summary', async (req, res) => {
    try {
        // 모든 보고서를 가져옴 (필요 시 특정 학생/팀으로 필터링 가능)
        const reports = await Report.find({}).sort({ week: 1 });
        
        if (reports.length === 0) {
            return res.json({ summary: "아직 제출된 보고서가 없어 분석을 진행할 수 없습니다." });
        }

        // 보고서 데이터 가공
        const reportsContext = reports.map(r => 
            `[${r.week}주차] 제목: ${r.title}\n내용: ${r.content}\nAI피드백: ${r.aiFeedback || '없음'}`
        ).join("\n\n---\n\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `당신은 교수님을 보좌하는 교육 분석 전문가입니다. 
                    학생들의 주차별 보고서와 AI 피드백 내역을 분석하여, 현재 학습이 어떻게 진행되고 있는지 요약해 주세요.
                    전체적인 학습 흐름, 학생의 성장 포인트, 그리고 교수님이 특히 신경 써야 할 부분을 포함하여 5줄 이내로 전문적으로 작성해 주세요.` 
                },
                { 
                    role: "user", 
                    content: `현재까지의 보고서 내역입니다:\n\n${reportsContext}` 
                }
            ],
        });

        res.json({ summary: completion.choices[0].message.content });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 5. 학생 답변 등록
app.patch('/api/reports/:week/reply', async (req, res) => {
    const { reply } = req.body;
    const weekNum = parseInt(req.params.week);
    try {
        const report = await Report.findOneAndUpdate(
            { week: weekNum },
            { studentReply: reply },
            { new: true }
        );
        res.json(report);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});