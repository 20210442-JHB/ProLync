require('dotenv').config(); // .env 파일 읽기
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // 환경변수에서 키 가져오기
});

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');

// 업로드된 파일이 임시로 저장될 폴더 설정
const upload = multer({ dest: 'uploads/' });

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
// prolync의 위치를 물음표(?) 앞으로 옮깁니다.
const db_uri = 'mongodb+srv://habin:habin11013~@cluster0.9w4124b.mongodb.net/prolync?appName=Cluster0';

mongoose.connect(db_uri)
  .then(() => console.log('개인 클라우드 MongoDB Connected...'))
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
    week: { type: Number, required: true, unique: true },
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
// 1. 사용자 로그인/생성 및 데이터 조회
app.post('/api/login', async (req, res) => {
    const { userId, name, role } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, name, role });
            await user.save();
        }
        res.json(user);
    } catch (err) {
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
            { new: true, upsert: true } // 사용자가 없으면 생성, 있으면 수정
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

// 2. 특정 주차 보고서 및 피드백 조회
app.get('/api/reports/:week', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        const report = await Report.findOne({ week: weekNum });
        res.json(report || {});
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 3. 보고서 저장/수정
app.post('/api/reports', async (req, res) => {
    const { week, title, content, authorId } = req.body;
    try {
        let report = await Report.findOneAndUpdate(
            { week },
            { title, content, authorId },
            { upsert: true, new: true }
        );
        res.json(report);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// [추가] 교수용: 강의자료/루브릭 파일 업로드 및 텍스트 학습 API
app.post('/api/upload-criteria/:week', upload.single('file'), async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        if (!req.file) {
            return res.status(400).send("업로드된 파일이 없습니다.");
        }

        let extractedText = "";

        // 파일 형식에 따른 텍스트 추출 분기 (PDF 예시)
        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(dataBuffer);
            extractedText = pdfData.text; // PDF에서 긁어온 텍스트
            
            // 임시 파일 삭제
            fs.unlinkSync(req.file.path);
        } else {
            // 일반 텍스트 파일 등 (.txt, .csv 등) 일 경우
            extractedText = fs.readFileSync(req.file.path, 'utf8');
            fs.unlinkSync(req.file.path);
        }

        // DB에 주차별로 학습 기준 텍스트 저장 (기존 데이터가 있으면 덮어쓰기)
        const criteria = await Criteria.findOneAndUpdate(
            { week: weekNum },
            { 
                fileName: req.file.originalname, 
                extractedText: extractedText,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.json({ message: "성공적으로 파일을 학습했습니다.", criteria });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// 4. AI 피드백 생성 (교수용)
// 4. AI 피드백 생성 (교수용) - 맞춤형 루브릭 반영 버전 🌟
app.patch('/api/reports/:week/ai-feedback', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        
        // 1. 학생의 보고서 가져오기
        const report = await Report.findOne({ week: weekNum });
        if (!report || !report.content) {
            return res.status(404).send("분석할 학생 보고서가 없습니다.");
        }

        // 2. [핵심] 해당 주차에 교수님이 업로드한 채점 기준(루브릭) 가져오기
        const criteria = await Criteria.findOne({ week: weekNum });
        let professorRubric = "제공된 별도의 루브릭이 없습니다. 일반적인 대학 과제 기준으로 평가하세요.";
        
        if (criteria && criteria.extractedText) {
            professorRubric = criteria.extractedText; // 파일에서 긁어온 내용 주입!
        }

        // 3. OpenAI API 호출 (교수님 루브릭 주입 프롬프트 엔지니어링)
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

        // 4. 생성된 피드백을 학생 리포트 DB에 반영
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