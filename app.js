const express = require('express');
const repo = require('./repository');
const moment = require("moment");
const schedule = require('node-schedule');
var cors = require('cors')
var mongo = require('mongodb');
const crypto = require("crypto");

const app = express();
app.use(express.json())
app.use(cors())
const port = 3001;
// first use , create these db and collection in mongo
// test.createDb('restaurant')
// test.insCollection('restaurant','tables')
// test.insCollection('restaurant','queue')


async function runExam(testId) {
    console.log('testId', testId)
    var o_id = new mongo.ObjectID(testId);
    let questions = []
    questions = await repo.findSpecial('exam', 'questions', {'test_id': testId})
    console.log('questions', questions)
    let totalT = questions.reduce((n, b) => n + b.ans_time, 0)
    console.log('totalT', totalT)
    let endDate = moment().add(totalT + 5, 'second').format('M D YYYY, hh:mm:ss')
    console.log('endDate', endDate)

    await repo.updateDuc('exam', 'tests', {'_id': o_id}, {end_date: endDate, status: 2})

}

function checkOneCorrect(ans) {
    let correct = ans.filter(x => x.correct == 1).length
    console.log('correct ans', correct)
    if (correct == 0)
        return {result: 'empty', message: 'گزینه ای انتخاب نشده'}
    else if (correct == 1)
        return {result: 'ok', message: ''}
    else
        return {result: 'notOk', message: 'بیش از یک گزینه انتخاب شده'}

}

function checkNumOption(ans) {
    let num = ans.length
    console.log('num ans', num)

    if (num >= 2 & num <= 4)
        return {result: true, message: ''}

    else
        return {result: false, message: 'تعداد گزینه هابین 2 تا 4 گزینه باشد'}

}
async function calculateScore(test_id,user){
    console.log('calculateScore user',user)

    let allQuestion=await repo.all('exam','questions')
    console.log('allQuestion',allQuestion)
    return    user.lst_ans.filter(y => y.test_id == test_id).map(y => ({
            questuinDetail:allQuestion.find(z=>z._id==y.question_id) ,
            answer_id: y.answer_id,

        })).map(y=>({
                selectedOption:y.questuinDetail?y.questuinDetail.ans.find(z=>z.id==y.answer_id):null,
                rate:y.questuinDetail?y.questuinDetail.quest_rate:0,
                bonos:user.bonos_score.find(z=>z.test_id==test_id)
            })).map(y=>({
                score:y.selectedOption?y.selectedOption.correct*y.rate:0+y.bonos?y.bonos:0
            })).reduce((n,i)=>n+i.score,0)




}

app.get('/', (req, res) => res.send('Hello World!'));
//define tables and chairs by owner
//reserve table by client
app.post('/api/insTest', async (req, res) => {
    console.log('body', req.body)
    try {
        let temp = {
            name: req.body.name,
            status: 0,
            start_date: moment(req.body.start_date).format('M D YYYY, hh:mm:ss'),
            end_date: '',
        }

        let i = await repo.insContent('exam', 'tests', req.body)
        console.log('i', i)
        if (i) {

            res.set('Content-Type', 'application/json');
            res.status(200)
            res.send({status: 1, message: 'successful'})
        }
    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.post('/api/beginTest', async (req, res) => {
    console.log('body', req.body)
    try {
        var o_id = new mongo.ObjectID(req.body.test_id);

        let test = (await repo.findSpecial('exam', 'tests', {_id: o_id}))[0]
        console.log('test',test)
        if (test) {
            if (test.end_date != '') {
                let user = (await repo.findSpecial('exam', 'users', {guid: req.body.guid}))[0]
                console.log('user',user)

                if (user) {
                    console.log('moment(test.end_date)',moment(test.end_date).format())
                    console.log('moment()',moment().format())
                    if (moment(test.end_date).format() > moment().format()) {
                        console.log('moment(test.end_date) > moment()',true)

                        if(req.body.answer_id & req.body.quistion_id){

                            let ans=user.lst_ans[user.lst_ans.findIndex(x=>x.quistion_id==req.body.quistion_id)]
                            if(moment(ans.end_date)>moment()){
                                user.lst_ans[user.lst_ans.findIndex(x=>x.quistion_id==req.body.quistion_id)].answer_id=req.body.answer_id
                                await repo.updateDuc('exam','users',{guid: req.body.guid},{lst_ans:user.lst_ans})
                            user=(await repo.findSpecial('exam', 'users', {guid: req.body.guid}))[0]
                            }
                        }
                        let testLeft = user.lst_ans.filter(x => x.test_id == req.body.test_id).filter(x=>x.start_date == '')
                        console.log('testLeft',testLeft)

                        if (testLeft.length > 0) {
                            var o_id = new mongo.ObjectID(testLeft[0].question_id);

                            let question = await repo.findSpecial('exam', 'questions', {_id: o_id})
                            console.log('question',question)

                            question = question.map(x => ({
                                quistion_id: x._id,
                                test_id: x.test_id,
                                ans_time: x.ans_time,
                                quest_text: x.quest_text,
                                quest_rate: x.quest_rate,
                                ans: x.ans.map(y => ({
                                    id: y.id,
                                    ans_text: y.ans_text,
                                }))
                            }))
                            let lstAns = user.lst_ans
                            lstAns[lstAns.indexOf(testLeft[0])].start_date = moment().format()
                            lstAns[lstAns.indexOf(testLeft[0])].end_date = moment().add(question.ans_time + 1, 'second').format()
                            await repo.updateDuc('exam', 'users', {guid: req.body.guid}, {lst_ans: lstAns})

                            res.set('Content-Type', 'application/json');
                            res.status(200)
                            res.send({status: 1, info: question})
                        } else {
                            let score= await calculateScore(req.body.test_id,user)

                            res.set('Content-Type', 'application/json');
                            res.status(200)
                            res.send({status: 2, info: {score:score}})
                        }

                    } else {
                        let score= await calculateScore(req.body.test_id,user)

                        res.set('Content-Type', 'application/json');
                        res.status(200)
                        res.send({status: 2, info: {score:score}})
                    }
                } else {
                    res.set('Content-Type', 'application/json');
                    res.status(400)
                    res.send({status: 0, message: 'کاربر تعریف نشده'})
                }
            } else {
                res.set('Content-Type', 'application/json');
                res.status(400)
                res.send({status: 0, message: 'تست هنوز شروع نشده است'})
            }
        } else {
            res.set('Content-Type', 'application/json');
            res.status(400)
            res.send({status: 0, message: 'تست موجود نیست'})
        }

    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.post('/api/awaitingTest', async (req, res) => {
    console.log('body', req.body)
    //            let i= await repo.updateDuc('exam','users',{guid:'f1de03c1'},{lst_ans:[2,2,2]})
    // console.log('عسثق فثسف', req.body)

    try {

        var o_id = new mongo.ObjectID(req.body.test_id);
        let lstQuestions = repo.findSpecial('exam', 'questions', {'test_id': req.body.test_id})
        let allUser = repo.all('exam', 'users')

        let find = repo.findSpecial('exam', 'tests', {'_id': o_id})
        let update = repo.updateDuc('exam', 'tests', {'_id': o_id}, {status: 1})
        let reternAllpromis = await Promise.all([find, update, lstQuestions, allUser])
        console.log('reternAllpromis', reternAllpromis)
//alluser
        let newUser = []
        reternAllpromis[3].forEach(x => {
            newUser.push({
                guid: x.guid,
                lst_question: reternAllpromis[2].map(z => ({
                    question_id: z._id.toString(),
                    randomNum: Math.floor(Math.random() * 101),
                    test_id: req.body.test_id,
                    answer_id: '',
                    start_date: '',
                    end_date: '',
                })).sort((a, b) => a.randomNum - b.randomNum)
            })

        })
        // console.log('newUser',newUser)

        newUser.forEach(async x => {
            await repo.updateDuc('exam', 'users', {guid: x.guid}, {lst_ans: x.lst_question})
// console.log('update user ',i)
        })

        if (reternAllpromis[1].n > 0) {
            console.log('moment(reternAllpromis[0].start_date).format()', moment(reternAllpromis[0][0].start_date).format())
            console.log('reternAllpromis[0][0].start_date', reternAllpromis[0][0].start_date)
            // runExam(req.body.test_id)
            schedule.scheduleJob(moment(reternAllpromis[0][0].start_date).format(), () => runExam(req.body.test_id));


            res.set('Content-Type', 'application/json');
            res.status(200)
            res.send({status: 1, message: 'successful'})
        }
    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.post('/api/insQuest', async (req, res) => {
    console.log('body', req.body)
    try {
        let resultCorrect = checkOneCorrect(req.body.ans)
        let resultNumOption = checkNumOption(req.body.ans)
        console.log('resultCorrect resultNumOption', resultCorrect, resultNumOption)
        if (resultCorrect.result == 'ok' & resultNumOption.result) {
            let temp = {
                test_id: req.body.test_id,
                ans_time: req.body.ans_time,
                quest_text: req.body.quest_text,
                quest_rate: req.body.quest_rate,
                ans: req.body.ans.map((x, ind) => ({
                    id: ind + 1,
                    ans_text: x.ans_text,
                    correct: x.correct,
                })),

            }

            let i = await repo.insContent('exam', 'questions', temp)
            if (i) {

                res.set('Content-Type', 'application/json');
                res.status(200)
                res.send({status: 1, message: 'successful'})
            }
        } else {
            let msg = [].push(resultNumOption.message)
            resultCorrect.result != 'ok' ? msg.push(resultCorrect.message) : null
            res.set('Content-Type', 'application/json');
            res.status(400)
            res.send({status: 0, message: msg})
        }
    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.post('/api/insUser', async (req, res) => {
    console.log('body', req.body)
    try {
        if (req.body.user_count >= 100) {
            let temp = []
            let p
            for (p = 0; p < req.body.user_count; p++) {
                temp.push({
                    guid: crypto.randomBytes(4).toString("hex"),
                    role_id: 2,
                    lst_ans: [],
                    bonos_score: [],
                })
            }
            console.log('temp', temp)
            let i = await repo.insMultCuntent('exam', 'users', temp)
            if (i) {

                res.set('Content-Type', 'application/json');
                res.status(200)
                res.send({status: 1, message: `${i} کاربر ثبت شد`})
            }
        } else {
            res.set('Content-Type', 'application/json');
            res.status(400)
            res.send({status: 0, message: 'تعداد کاربران حداقل 100 نفر باشد'})
        }
    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.post('/api/delAllUser', async (req, res) => {
    console.log('body', req.body)
    try {

        let i = await repo.deleteAllContent('exam', 'users')
        if (i) {

            res.set('Content-Type', 'application/json');
            res.status(200)
            res.send({status: 1, message: `${i} کاربر حذف شد`})
        }

    } catch (e) {
        res.set('Content-Type', 'application/json');
        res.status(400)
        res.send({status: 0, message: e})
    }
})
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
