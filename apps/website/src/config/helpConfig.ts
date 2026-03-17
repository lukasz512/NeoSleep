export interface HelpCategory {
  id: 'condition' | 'treatment' | 'dentists' | 'privacy';
  titleKey: string;
  descKey: string;
}

export interface FaqItem {
  id: string;
  category: HelpCategory['id'];
  questionKey: string;
  answerKey: string;
}

export const helpCategories: HelpCategory[] = [
  { id: 'condition', titleKey: 'website.help.cat.condition.title', descKey: 'website.help.cat.condition.desc' },
  { id: 'treatment', titleKey: 'website.help.cat.treatment.title', descKey: 'website.help.cat.treatment.desc' },
  { id: 'dentists',  titleKey: 'website.help.cat.dentists.title',  descKey: 'website.help.cat.dentists.desc'  },
  { id: 'privacy',   titleKey: 'website.help.cat.privacy.title',   descKey: 'website.help.cat.privacy.desc'   },
];

export const helpFaqs: FaqItem[] = [
  { id: 'q1', category: 'condition', questionKey: 'website.help.faq.q1.q', answerKey: 'website.help.faq.q1.a' },
  { id: 'q2', category: 'condition', questionKey: 'website.help.faq.q2.q', answerKey: 'website.help.faq.q2.a' },
  { id: 'q3', category: 'treatment', questionKey: 'website.help.faq.q3.q', answerKey: 'website.help.faq.q3.a' },
  { id: 'q4', category: 'treatment', questionKey: 'website.help.faq.q4.q', answerKey: 'website.help.faq.q4.a' },
  { id: 'q5', category: 'dentists',  questionKey: 'website.help.faq.q5.q', answerKey: 'website.help.faq.q5.a' },
  { id: 'q6', category: 'dentists',  questionKey: 'website.help.faq.q6.q', answerKey: 'website.help.faq.q6.a' },
  { id: 'q7', category: 'privacy',   questionKey: 'website.help.faq.q7.q', answerKey: 'website.help.faq.q7.a' },
  { id: 'q8', category: 'privacy',   questionKey: 'website.help.faq.q8.q', answerKey: 'website.help.faq.q8.a' },
];
