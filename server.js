const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

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
    userId: String,
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

// 4. AI 피드백 생성 (교수용)
app.patch('/api/reports/:week/ai-feedback', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        const feedback = "AI 분석 결과, 기획의 명확성이 훌륭합니다. 보안성 설계를 보완해 보세요.";
        const report = await Report.findOneAndUpdate(
            { week: weekNum },
            { aiFeedback: feedback },
            { new: true }
        );
        res.json(report);
    } catch (err) {
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