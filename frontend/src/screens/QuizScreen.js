import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';








const DIFF_COLORS = { Easy: '#22c55e', Medium: '#d97706', Hard: '#ef4444' };

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const QuizScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(300);
  const [quizStarted, setQuizStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Quiz',
    });
  }, [navigation]);

  useEffect(() => {loadQuiz();}, []);

  useEffect(() => {
    let timer;
    if (quizStarted && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0 && quizStarted) {
      handleSubmitQuiz();
    }
    return () => clearTimeout(timer);
  }, [timeLeft, quizStarted]);

  const loadQuiz = async () => {
    try {
      const res = await legendsApi.getDailyQuiz();
      if (res.success) setQuiz(res.data);
    } catch {Alert.alert('Error', 'Failed to load quiz');} finally
    {setLoading(false);}
  };

  const handleStartQuiz = () => {
    setQuizStarted(true);
    setTimeLeft(quiz.duration || 300);
  };

  const handleAnswerSelect = (qIdx, aIdx) => setAnswers((prev) => ({ ...prev, [qIdx]: aIdx }));

  const handleNext = () => {
    if (currentQuestion < quiz.questions.length - 1) setCurrentQuestion((q) => q + 1);else
    handleSubmitQuiz();
  };

  const handlePrev = () => {if (currentQuestion > 0) setCurrentQuestion((q) => q - 1);};

  const handleSubmitQuiz = async () => {
    try {
      const res = await legendsApi.submitQuiz(quiz.id, answers);
      if (res.success) navigation.navigate('QuizResult', { quizId: quiz.id, answers, result: res.data });
    } catch {Alert.alert('Error', 'Failed to submit quiz');}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  if (!quiz) {
    return (
      <View style={styles.centered}>
        <Icon name="help-circle-outline" size={52} color={DS.textMuted} />
        <Text style={styles.emptyTitle}>No quiz today</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadQuiz}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>);

  }

  if (!quizStarted) {
    const diff = quiz.difficulty || 'Medium';
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <Icon name="help-circle" size={20} color={DS.textMuted} />
          <Text style={styles.heroTitle}>Daily Quiz</Text>
        </View>

        <View style={styles.introBody}>
          <Text style={styles.quizTitle}>{quiz.title}</Text>
          {!!quiz.description && <Text style={styles.quizDesc}>{quiz.description}</Text>}

          <View style={styles.detailRow}>
            <View style={styles.detailBox}>
              <Icon name="format-list-numbered" size={22} color={DS.lime} />
              <Text style={styles.detailVal}>{quiz.questions?.length ?? 0}</Text>
              <Text style={styles.detailLbl}>Questions</Text>
            </View>
            <View style={styles.detailBox}>
              <Icon name="timer-outline" size={22} color={DS.blue} />
              <Text style={styles.detailVal}>{formatTime(quiz.duration || 300)}</Text>
              <Text style={styles.detailLbl}>Time Limit</Text>
            </View>
            <View style={styles.detailBox}>
              <Icon name="speedometer" size={22} color={DIFF_COLORS[diff] || DS.lime} />
              <Text style={[styles.detailVal, { color: DIFF_COLORS[diff] }]}>{diff}</Text>
              <Text style={styles.detailLbl}>Difficulty</Text>
            </View>
          </View>

          <View style={styles.rewardsCard}>
            <View style={styles.rewardsHeader}>
              <Icon name="trophy" size={16} color="#d97706" />
              <Text style={styles.rewardsTitle}>Rewards</Text>
            </View>
            <Text style={styles.rewardLine}>• Top 10 — 100 points</Text>
            <Text style={styles.rewardLine}>• Top 50 — 50 points</Text>
            <Text style={styles.rewardLine}>• All participants — 10 points</Text>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={handleStartQuiz}>
            <Icon name="play-circle" size={20} color={DS.bg} />
            <Text style={styles.startBtnText}>Start Quiz</Text>
          </TouchableOpacity>
        </View>
      </View>);

  }

  const question = quiz.questions[currentQuestion];
  const progress = (currentQuestion + 1) / quiz.questions.length * 100;
  const isLast = currentQuestion === quiz.questions.length - 1;
  const timerColor = timeLeft < 60 ? DS.live : DS.textPrimary;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroProgress}>
          <View style={[styles.heroProgressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.heroMeta}>
          <Text style={styles.heroCount}>{currentQuestion + 1} / {quiz.questions.length}</Text>
          <View style={styles.timerPill}>
            <Icon name="timer-outline" size={14} color={timerColor} />
            <Text style={[styles.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      <FlatList
        data={question.options}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={styles.optionsList}
        renderItem={({ item, index }) => {
          const selected = answers[currentQuestion] === index;
          return (
            <TouchableOpacity
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => handleAnswerSelect(currentQuestion, index)}
              activeOpacity={0.8}>
              
              <View style={[styles.optionLetter, selected && styles.optionLetterSelected]}>
                <Text style={[styles.optionLetterText, selected && { color: DS.bg }]}>
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item}</Text>
              {selected && <Icon name="check-circle" size={18} color={DS.lime} />}
            </TouchableOpacity>);

        }} />
      

      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentQuestion === 0 && styles.navBtnDisabled]}
          onPress={handlePrev}
          disabled={currentQuestion === 0}>
          
          <Icon name="arrow-left" size={18} color={currentQuestion === 0 ? DS.textMuted : DS.textPrimary} />
          <Text style={[styles.navBtnText, currentQuestion === 0 && { color: DS.textMuted }]}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>{isLast ? 'Submit' : 'Next'}</Text>
          <Icon name={isLast ? 'check' : 'arrow-right'} size={18} color={DS.bg} />
        </TouchableOpacity>
      </View>
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg, gap: 12 },

  hero: {
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },

  introBody: { padding: 16, gap: 16 },
  quizTitle: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, textAlign: 'center' },
  quizDesc: { fontSize: 14, color: DS.textVariant, textAlign: 'center', lineHeight: 20 },
  detailRow: { flexDirection: 'row', gap: 10 },
  detailBox: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16,
    padding: 14, alignItems: 'center', gap: 4
  },
  detailVal: { fontSize: 16, fontWeight: '900', color: DS.textPrimary },
  detailLbl: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },
  rewardsCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 6
  },
  rewardsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  rewardsTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  rewardLine: { fontSize: 13, color: DS.textVariant, lineHeight: 20 },
  startBtn: {
    backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8
  },
  startBtnText: { fontSize: 16, fontWeight: '800', color: DS.bg },

  heroProgress: { height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, marginBottom: 10, flex: 1 },
  heroProgressFill: { height: '100%', backgroundColor: DS.lime, borderRadius: 2 },
  heroMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCount: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4
  },
  timerText: { fontSize: 13, fontWeight: '800' },

  questionCard: {
    backgroundColor: DS.surfaceHigh, margin: 16, borderRadius: 16, padding: 16
  },
  questionText: { fontSize: 17, fontWeight: '700', color: DS.textPrimary, lineHeight: 26 },
  optionsList: { paddingHorizontal: 16, gap: 10 },
  option: {
    backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12
  },
  optionSelected: { backgroundColor: DS.lime + '1A' },
  optionLetter: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center'
  },
  optionLetterSelected: { backgroundColor: DS.lime },
  optionLetterText: { fontSize: 13, fontWeight: '900', color: DS.textPrimary },
  optionText: { flex: 1, fontSize: 15, color: DS.textPrimary, lineHeight: 20 },
  optionTextSelected: { color: DS.lime, fontWeight: '700' },

  navRow: {
    flexDirection: 'row', gap: 10, padding: 16, backgroundColor: DS.surfaceLow
  },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 12
  },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  nextBtn: {
    flex: 1, backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6
  },
  nextBtnText: { fontSize: 14, fontWeight: '800', color: DS.bg },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  refreshBtn: { backgroundColor: DS.lime, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  refreshBtnText: { fontSize: 15, fontWeight: '700', color: DS.bg }
});

export default QuizScreen;