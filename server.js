require('dotenv').config();

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const express  = require('express');
const mongoose = require('mongoose');
const path     = require('path');
const cors     = require('cors');
const multer    = require('multer');
const pdfParse  = require('pdf-parse');
const fs        = require('fs');

if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        try {
            cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'binary').toString('utf8'));
        } catch {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
});
const upload = multer({ storage });

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});
app.use(express.static(__dirname));

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('개인 클라우드 MongoDB Connected...');
        try {
            await mongoose.connection.db.collection('criterias').dropIndex('week_1');
        } catch { /* 이미 없으면 무시 */ }
    })
    .catch(err => { console.error('!!! MongoDB 연결 실패 !!!', err); });

// ── Schemas ──────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
    userId:   { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name:  String,
    role:  String,
    tokens: { type: Number, default: 320 }
});

const ReportSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    groupId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    week:     Number,
    title:    String,
    content:  String,
    authorId: String,
    aiFeedback: String,
    studentReplies: [{
        name: String, content: String,
        createdAt: { type: Date, default: Date.now },
        profReplies: [{ name: String, content: String, createdAt: { type: Date, default: Date.now } }]
    }],
    isLocked: { type: Boolean, default: true }
});

const CriteriaSchema = new mongoose.Schema({
    courseId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    week:          { type: Number, required: true },
    fileName:      String,
    extractedText: String,
    updatedAt:     { type: Date, default: Date.now }
});

const CourseSchema = new mongoose.Schema({
    title:       { type: String, required: true },
    inviteCode:  { type: String, unique: true },
    professorId: { type: String, required: true },
    professorName: String,
    enrolledStudents: [{ userId: String, name: String, joinedAt: { type: Date, default: Date.now } }],
    syllabusAnalysis: {
        weekCount:  { type: Number, default: 0 },
        milestones: [{ label: String, targetWeek: Number }],
        weeklyPlan: [{ week: Number, topic: String }],
        analyzedAt: Date
    },
    createdAt: { type: Date, default: Date.now }
});

const GroupSchema = new mongoose.Schema({
    name:        { type: String, required: true },
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    inviteCode:  { type: String, unique: true },
    leaderId:    String,
    leaderName:  String,
    members: [{ userId: String, name: String, joinedAt: { type: Date, default: Date.now } }],
    currentMilestoneIdx: { type: Number, default: 0 },
    milestoneStatus:     { type: String, enum: ['active', 'pending_approval', 'all_completed'], default: 'active' },
    notionLink:          String,
    notionSummary:       String,
    notionSummarizedAt:  Date,
    createdAt: { type: Date, default: Date.now }
});

const User     = mongoose.model('User',     UserSchema);
const Report   = mongoose.model('Report',   ReportSchema);
const Criteria = mongoose.model('Criteria', CriteriaSchema);
const Course   = mongoose.model('Course',   CourseSchema);
const Group    = mongoose.model('Group',    GroupSchema);

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function reportFilter(weekNum, courseId, groupId) {
    const q = { week: weekNum };
    if (courseId) q.courseId = courseId;
    if (groupId)  q.groupId  = groupId;
    return q;
}

// ── 기본 라우트 ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── 회원 API ──────────────────────────────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
    const { userId, password, name, role } = req.body;
    try {
        if (await User.findOne({ userId }))
            return res.status(400).json({ message: "이미 존재하는 학번/교번입니다." });
        await new User({ userId, password, name: name || "신규 가입자", role: role || "student", tokens: role === 'prof' ? 0 : 320 }).save();
        res.json({ message: "회원가입이 완료되었습니다! 로그인해 주세요." });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/login', async (req, res) => {
    const { userId, password, role } = req.body;
    try {
        const user = await User.findOne({ userId });
        if (!user)               return res.status(401).json({ message: "존재하지 않는 학번 또는 교번입니다." });
        if (user.password !== password) return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
        if (user.role !== role)  return res.status(403).json({ message: "선택하신 회원 유형(학생/교수)이 일치하지 않습니다." });
        res.json(user);
    } catch (err) { res.status(500).send(err.message); }
});

app.patch('/api/users/:userId/tokens', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ userId: req.params.userId }, { tokens: req.body.tokens }, { new: true, upsert: true });
        res.json(user);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/users/mvp', async (req, res) => {
    try { res.json(await User.findOne().sort({ tokens: -1 }) || { name: '없음', tokens: 0 }); }
    catch (err) { res.status(500).send(err.message); }
});

app.get('/api/users/total-tokens', async (req, res) => {
    try {
        const result = await User.aggregate([{ $group: { _id: null, total: { $sum: "$tokens" } } }]);
        res.json({ totalTokens: result.length > 0 ? result[0].total : 0 });
    } catch (err) { res.status(500).send(err.message); }
});

// ── 과목 API ──────────────────────────────────────────────────────────────────

app.post('/api/courses', async (req, res) => {
    const { title, professorId, professorName } = req.body;
    if (!title || !professorId) return res.status(400).json({ message: "과목명과 교수자 정보가 필요합니다." });
    try {
        let inviteCode, exists = true;
        while (exists) { inviteCode = generateInviteCode(); exists = await Course.findOne({ inviteCode }); }
        res.json(await new Course({ title, inviteCode, professorId, professorName }).save());
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/courses/join', async (req, res) => {
    const { inviteCode, userId, name } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: "초대 코드와 학번이 필요합니다." });
    try {
        const course = await Course.findOne({ inviteCode: inviteCode.toUpperCase() });
        if (!course) return res.status(404).json({ message: "유효하지 않은 초대 코드입니다." });
        if (course.enrolledStudents.some(s => s.userId === userId))
            return res.status(400).json({ message: "이미 참여 중인 과목입니다." });
        course.enrolledStudents.push({ userId, name });
        await course.save();
        res.json(course);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/courses/by-user/:userId', async (req, res) => {
    const { userId } = req.params;
    const { role } = req.query;
    try {
        const courses = role === 'prof'
            ? await Course.find({ professorId: userId }).sort({ createdAt: -1 })
            : await Course.find({ 'enrolledStudents.userId': userId }).sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/courses/:courseId', async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        res.json({ message: "과목이 삭제되었습니다." });
    } catch (err) { res.status(500).send(err.message); }
});

// 단일 과목 조회
app.get('/api/courses/:courseId', async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        res.json(course);
    } catch (err) { res.status(500).send(err.message); }
});

// 강의 계획서 AI 분석 공통 헬퍼
const SYLLABUS_SYSTEM_PROMPT = `강의 계획서를 분석하여 반드시 아래 JSON 형식으로만 반환하세요:
{
  "weekCount": 전체 주차 수 (정수),
  "milestones": [
    { "label": "마일스톤 이름", "targetWeek": 목표 주차 }
  ],
  "weeklyPlan": [
    { "week": 주차 번호, "topic": "주차별 주요 내용 (20자 이내)" }
  ]
}
milestones는 프로젝트 주요 단계 3~6개를 추출하세요. 없으면 일반적인 단계(기획→설계→구현→테스트→발표)로 생성하세요.`;

async function runSyllabusAI(text) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYLLABUS_SYSTEM_PROMPT },
            { role: "user",   content: `강의 계획서:\n${text.slice(0, 6000)}` }
        ]
    });
    return JSON.parse(completion.choices[0].message.content);
}

async function saveSyllabusToCourse(course, analysis) {
    course.syllabusAnalysis = {
        weekCount:  Number(analysis.weekCount)  || 15,
        milestones: Array.isArray(analysis.milestones) ? analysis.milestones : [],
        weeklyPlan: Array.isArray(analysis.weeklyPlan) ? analysis.weeklyPlan : [],
        analyzedAt: new Date()
    };
    await course.save();
    return course;
}

// 강의 계획서 파일 업로드 + AI 분석
app.post('/api/courses/:courseId/syllabus', upload.single('file'), async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        if (!req.file)  return res.status(400).json({ message: "업로드된 파일이 없습니다." });

        let extractedText = "";
        try {
            if (req.file.mimetype === 'application/pdf') {
                extractedText = (await pdfParse(fs.readFileSync(req.file.path))).text;
            } else {
                extractedText = fs.readFileSync(req.file.path, 'utf8');
            }
        } catch (parseErr) {
            return res.status(400).json({ message: `파일 읽기 실패: ${parseErr.message}` });
        } finally {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        if (!extractedText.trim()) {
            return res.status(400).json({
                message: "이 PDF는 이미지 스캔본이라 텍스트를 추출할 수 없습니다.",
                hint: "직접 입력 탭을 이용해 강의 계획서 내용을 붙여넣어 주세요."
            });
        }

        const analysis = await runSyllabusAI(extractedText);
        const updatedCourse = await saveSyllabusToCourse(course, analysis);
        res.json({ message: "강의 계획서 분석이 완료되었습니다.", course: updatedCourse });

    } catch (err) {
        console.error('[Syllabus File] Error:', err.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const status = err.status === 401 ? 503 : 500;
        const msg = err.status === 401
            ? "OpenAI API 키가 유효하지 않습니다."
            : `서버 오류: ${err.message}`;
        res.status(status).json({ message: msg });
    }
});

// 강의 계획서 직접 입력 + AI 분석
app.post('/api/courses/:courseId/syllabus-text', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ message: "분석할 텍스트가 없습니다." });

        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });

        const analysis = await runSyllabusAI(text);
        const updatedCourse = await saveSyllabusToCourse(course, analysis);
        res.json({ message: "강의 계획서 분석이 완료되었습니다.", course: updatedCourse });

    } catch (err) {
        console.error('[Syllabus Text] Error:', err.message);
        const status = err.status === 401 ? 503 : 500;
        const msg = err.status === 401
            ? "OpenAI API 키가 유효하지 않습니다."
            : `서버 오류: ${err.message}`;
        res.status(status).json({ message: msg });
    }
});

// ── 조 API ────────────────────────────────────────────────────────────────────

// 조 생성 (학생)
app.post('/api/groups', async (req, res) => {
    const { name, courseId, leaderId, leaderName } = req.body;
    if (!name || !courseId || !leaderId) return res.status(400).json({ message: "조 이름, 과목 ID, 학번이 필요합니다." });
    try {
        let inviteCode, exists = true;
        while (exists) { inviteCode = generateInviteCode(); exists = await Group.findOne({ inviteCode }); }
        const group = await new Group({ name, courseId, inviteCode, leaderId, leaderName, members: [{ userId: leaderId, name: leaderName }] }).save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 조 참여 (학생 — 초대 코드)
app.post('/api/groups/join', async (req, res) => {
    const { inviteCode, userId, name } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: "초대 코드와 학번이 필요합니다." });
    try {
        const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
        if (!group) return res.status(404).json({ message: "유효하지 않은 초대 코드입니다." });
        if (group.members.some(m => m.userId === userId))
            return res.status(400).json({ message: "이미 참여 중인 조입니다." });
        group.members.push({ userId, name });
        await group.save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 과목별 조 목록 조회
app.get('/api/groups/by-course/:courseId', async (req, res) => {
    try {
        res.json(await Group.find({ courseId: req.params.courseId }).sort({ createdAt: 1 }));
    } catch (err) { res.status(500).send(err.message); }
});

// 사용자의 조 조회 (과목별)
app.get('/api/groups/my/:userId', async (req, res) => {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: "courseId가 필요합니다." });
    try {
        res.json(await Group.findOne({ courseId, 'members.userId': req.params.userId }) || null);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 완료 요청 (학생)
app.post('/api/groups/:groupId/milestone-request', async (req, res) => {
    try {
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { milestoneStatus: 'pending_approval' },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 승인 (교수)
app.patch('/api/groups/:groupId/milestone-approve', async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        const course = await Course.findById(group.courseId);
        const milestoneCount = course?.syllabusAnalysis?.milestones?.length || 5;
        const nextIdx = group.currentMilestoneIdx + 1;
        group.currentMilestoneIdx = nextIdx;
        group.milestoneStatus = nextIdx >= milestoneCount ? 'all_completed' : 'active';
        await group.save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 반려 (교수)
app.patch('/api/groups/:groupId/milestone-reject', async (req, res) => {
    try {
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { milestoneStatus: 'active' },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// ── 노션 페이지 API ───────────────────────────────────────────────────────────

async function scrapeNotionPage(url) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
        signal: AbortSignal.timeout(30000)
    });
    if (res.status === 403 || res.status === 401) throw new Error('LOGIN_REQUIRED');
    if (!res.ok) throw new Error(`페이지를 불러오지 못했습니다 (${res.status})`);
    return await res.text();
}

// 노션 페이지 등록 + AI 정리
app.post('/api/groups/:groupId/notion', async (req, res) => {
    const { notionUrl } = req.body;
    if (!notionUrl) return res.status(400).json({ message: 'Notion URL이 필요합니다.' });

    try {
        const extractedText = await scrapeNotionPage(notionUrl);

        if (!extractedText || !extractedText.trim()) {
            return res.status(400).json({ message: '페이지에서 텍스트 내용을 찾지 못했습니다. 페이지에 내용이 있는지 확인해주세요.' });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Notion 페이지의 내용을 빠짐없이 읽기 좋게 정리해주는 어시스턴트입니다. 헤더·목록·체크리스트 등 원본 구조를 유지하면서 깔끔하게 정리해주세요. 내용을 임의로 축약하거나 생략하지 마세요.'
                },
                {
                    role: 'user',
                    content: `다음 Notion 페이지 내용을 정리해주세요:\n\n${extractedText.slice(0, 6000)}`
                }
            ],
            max_tokens: 2000,
            temperature: 0.3
        });

        const summary = completion.choices[0].message.content;
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { notionLink: notionUrl, notionSummary: summary, notionSummarizedAt: new Date() },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: '조를 찾을 수 없습니다.' });
        res.json(group);

    } catch (err) {
        console.error('[Notion] Error:', err.message);
        if (err.message === 'LOGIN_REQUIRED')
            return res.status(403).json({ message: '이 Notion 페이지는 비공개 상태입니다. Notion에서 "Share with anyone" 또는 "Publish to web"으로 설정해주세요.' });
        if (err.name === 'TimeoutError' || err.message.includes('timeout'))
            return res.status(408).json({ message: '페이지 로딩 시간이 초과됐습니다.' });
        res.status(500).json({ message: `서버 오류: ${err.message}` });
    }
});

// ── 파일 업로드 API ───────────────────────────────────────────────────────────

app.get('/api/upload-criteria', async (req, res) => {
    try {
        const query = {};
        if (req.query.courseId) query.courseId = req.query.courseId;
        res.json(await Criteria.find(query).sort({ week: 1 }));
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/upload-criteria/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("유효하지 않은 자료 ID 형식입니다.");
    try {
        const deleted = await Criteria.findByIdAndDelete(id);
        if (!deleted) return res.status(404).send("삭제할 자료를 찾을 수 없습니다.");
        res.json({ message: "자료가 성공적으로 삭제되었습니다." });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/upload-criteria/:week', upload.single('file'), async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        if (!req.file) return res.status(400).send("업로드된 파일이 없습니다.");

        let safeFileName = req.file.originalname;
        try { safeFileName = Buffer.from(req.file.originalname, 'binary').toString('utf8'); } catch {}

        let extractedText = "";
        if (req.file.mimetype === 'application/pdf') {
            try { extractedText = (await pdfParse(fs.readFileSync(req.file.path))).text; }
            catch { throw new Error("PDF 파일 분석에 실패했습니다."); }
        } else if (req.file.mimetype.includes('spreadsheet') || req.file.originalname.endsWith('.xlsx')) {
            extractedText = `[엑셀 파일: ${safeFileName}] 채점 루브릭 기준으로 사용됩니다.`;
        } else {
            extractedText = fs.readFileSync(req.file.path, 'utf8');
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const { courseId } = req.body;
        const criteriaData = { week: weekNum, fileName: safeFileName, extractedText, updatedAt: new Date() };
        if (courseId) criteriaData.courseId = courseId;
        const criteria = await new Criteria(criteriaData).save();
        res.json({ message: "성공적으로 파일을 학습했습니다.", criteria });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(err.message);
    }
});

// ── 보고서 API ────────────────────────────────────────────────────────────────

// 전체 분석 요약 — :week 보다 먼저 등록
app.get('/api/reports/overall-summary', async (req, res) => {
    const { courseId, groupId } = req.query;
    try {
        const query = {};
        if (courseId) query.courseId = courseId;
        if (groupId)  query.groupId  = groupId;
        const reports = await Report.find(query).sort({ week: 1 });
        if (reports.length === 0)
            return res.json({ summary: "아직 제출된 보고서가 없어 분석을 진행할 수 없습니다." });

        const reportsContext = reports.map(r =>
            `[${r.week}주차] 제목: ${r.title}\n내용: ${r.content}\nAI피드백: ${r.aiFeedback || '없음'}`
        ).join("\n\n---\n\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `당신은 교수님을 보좌하는 교육 분석 전문가입니다. 학생들의 주차별 보고서와 AI 피드백 내역을 분석하여 현재 학습 진행 상황을 5줄 이내로 전문적으로 요약해 주세요.` },
                { role: "user",   content: `현재까지의 보고서 내역입니다:\n\n${reportsContext}` }
            ],
        });
        res.json({ summary: completion.choices[0].message.content });
    } catch (err) { res.status(500).send(err.message); }
});

// 특정 주차 보고서 조회
app.get('/api/reports/:week', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    const { courseId, groupId } = req.query;
    try {
        const report = await Report.findOne(reportFilter(weekNum, courseId, groupId));
        if (!report) return res.status(404).json({ message: "해당 주차의 보고서가 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// AI 피드백 재생성 (교수용)
app.patch('/api/reports/:week/ai-feedback', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { courseId, groupId } = req.body;
    try {
        const filter = reportFilter(weekNum, courseId, groupId);
        const report = await Report.findOne(filter);
        if (!report || !report.content) return res.status(404).send("분석할 학생 보고서가 없습니다.");

        const criteriaQuery = { week: weekNum };
        if (courseId) criteriaQuery.courseId = courseId;
        const allCriteria = await Criteria.find(criteriaQuery);
        const professorRubric = allCriteria.length > 0
            ? allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n")
            : "제공된 루브릭 없음. 일반적인 대학 과제 기준으로 평가하세요.";

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `대학 교수님의 평가 기조를 대변하는 AI 튜터입니다. 아래 채점 루브릭을 기반으로 학생 보고서를 3줄 내외로 평가해 주세요.\n\n[루브릭]:\n${professorRubric}` },
                { role: "user",   content: `제목: ${report.title}\n내용: ${report.content}` }
            ],
        });

        const updatedReport = await Report.findOneAndUpdate(filter, { aiFeedback: completion.choices[0].message.content }, { new: true });
        res.json(updatedReport);
    } catch (err) { res.status(500).send(err.message); }
});

// 보고서 제출 + AI 피드백 자동 생성
app.post('/api/reports/submit', async (req, res) => {
    const { week, title, content, authorId, courseId, groupId } = req.body;
    try {
        const criteriaQuery = { week: parseInt(week) };
        if (courseId) criteriaQuery.courseId = courseId;
        const allCriteria = await Criteria.find(criteriaQuery);
        const criteriaText = allCriteria.length > 0
            ? allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n")
            : "제공된 교수자 평가 기준 없음. 일반적인 대학 프로젝트 기준에서 피드백해 주세요.";

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `대학 강의 전담 AI 튜터입니다. 교수님 평가 기준 기반으로 학생 결과물을 분석하여 2~3문장 이내로 건설적인 피드백을 작성해 주세요.` },
                { role: "user",   content: `[평가 기준]:\n${criteriaText}\n\n[제출물]:\n주차: ${week}주차\n제목: ${title}\n내용: ${content}` }
            ],
            temperature: 0.7, max_tokens: 500
        });

        const filter = reportFilter(parseInt(week), courseId, groupId);
        const updatedReport = await Report.findOneAndUpdate(
            filter,
            { title, content, authorId, aiFeedback: response.choices[0].message.content, courseId, groupId },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true, message: "보고서가 제출되었으며 AI 피드백이 생성되었습니다.", report: updatedReport });
    } catch (err) {
        res.status(500).json({ success: false, error: "AI 피드백 생성 중 오류가 발생했습니다." });
    }
});

// 학생 코멘트 등록
app.patch('/api/reports/:week/reply', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { reply, name, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $push: { studentReplies: { name: name || '학생', content: reply } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 학생 코멘트 수정
app.patch('/api/reports/:week/reply/:replyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { content, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(filter, { $set: { 'studentReplies.$.content': content } }, { new: true });
        if (!report) return res.status(404).json({ message: "코멘트를 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 학생 코멘트 삭제
app.delete('/api/reports/:week/reply/:replyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { courseId, groupId } = req.query;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $pull: { studentReplies: { _id: replyId } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 등록 (특정 코멘트)
app.post('/api/reports/:week/reply/:replyId/prof-reply', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { content, name, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(
            filter,
            { $push: { 'studentReplies.$.profReplies': { name: name || '교수자', content } } },
            { new: true }
        );
        if (!report) return res.status(404).json({ message: "코멘트를 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 수정
app.patch('/api/reports/:week/reply/:replyId/prof-reply/:profReplyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId, profReplyId } = req.params;
    const { content, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $set: { 'studentReplies.$[sr].profReplies.$[pr].content': content } },
            {
                arrayFilters: [{ 'sr._id': new mongoose.Types.ObjectId(replyId) }, { 'pr._id': new mongoose.Types.ObjectId(profReplyId) }],
                new: true
            }
        );
        if (!report) return res.status(404).json({ message: "답글을 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 삭제
app.delete('/api/reports/:week/reply/:replyId/prof-reply/:profReplyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId, profReplyId } = req.params;
    const { courseId, groupId } = req.query;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(
            filter,
            { $pull: { 'studentReplies.$.profReplies': { _id: profReplyId } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// ── 학기 마무리 교수자 AI 피드백 ──────────────────────────────────────────────

app.get('/api/courses/:courseId/semester-feedback', async (req, res) => {
    try {
        const { courseId } = req.params;

        const [course, groups, reports, criterias] = await Promise.all([
            Course.findById(courseId),
            Group.find({ courseId }),
            Report.find({ courseId }).sort({ week: 1 }),
            Criteria.find({ courseId })
        ]);

        if (!course) return res.status(404).json({ message: '과목을 찾을 수 없습니다.' });

        // 조별 진행 현황 요약
        const milestones = course.syllabusAnalysis?.milestones || [];
        const milestoneCount = milestones.length || 5;
        const groupSummary = groups.map(g => {
            const progress = milestoneCount > 0
                ? Math.round((g.currentMilestoneIdx / milestoneCount) * 100)
                : 0;
            return `- ${g.name}: 마일스톤 ${g.currentMilestoneIdx}/${milestoneCount} 완료 (${progress}%), 상태: ${g.milestoneStatus}, 팀원 ${g.members.length}명`;
        }).join('\n') || '등록된 조 없음';

        // 보고서 제출 현황
        const reportSummary = reports.map(r =>
            `[${r.week}주차] "${r.title}" — AI피드백: ${r.aiFeedback ? r.aiFeedback.slice(0, 80) + '...' : '없음'} / 학생코멘트 ${r.studentReplies?.length || 0}건`
        ).join('\n') || '제출된 보고서 없음';

        // 평가 기준 자료 현황
        const criteriaWeeks = [...new Set(criterias.map(c => c.week))].sort((a, b) => a - b);
        const criteriaSummary = criteriaWeeks.length > 0
            ? `${criteriaWeeks.join(', ')}주차 기준 자료 등록됨 (총 ${criterias.length}개)`
            : '등록된 기준 자료 없음';

        const context = `
과목명: ${course.title}
전체 주차: ${course.syllabusAnalysis?.weekCount || '미설정'}주
등록 학생 수: ${course.enrolledStudents?.length || 0}명
조 수: ${groups.length}개

[조별 마일스톤 진행 현황]
${groupSummary}

[주차별 보고서 및 AI 피드백 현황]
${reportSummary}

[평가 기준 자료 현황]
${criteriaSummary}
`.trim();

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `당신은 대학 교육 전문가입니다. 한 학기 수업 운영 데이터를 바탕으로 교수자에게 다음 학기 개선 방향을 제안해주세요.
다음 항목을 포함하여 구체적이고 실질적인 피드백을 작성하세요:
1. 이번 학기 전반적인 운영 평가 (2~3줄)
2. 조별 진행 관리 측면 개선점
3. 보고서·피드백 운영 측면 개선점
4. 평가 기준 및 루브릭 측면 개선점
5. 다음 학기를 위한 핵심 제안 3가지 (bullet point)
전문적이되 따뜻한 어조로 작성해주세요.`
                },
                {
                    role: 'user',
                    content: `다음은 이번 학기 수업 운영 데이터입니다:\n\n${context}`
                }
            ],
            max_tokens: 1500,
            temperature: 0.5
        });

        res.json({ feedback: completion.choices[0].message.content });
    } catch (err) {
        console.error('[SemesterFeedback]', err.message);
        res.status(500).json({ message: `서버 오류: ${err.message}` });
    }
});

app.listen(PORT, () => console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`));
