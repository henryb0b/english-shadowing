import type { Story, Sentence } from '../types';

/**
 * Helper: builds a sentence. A sentence is self-scorable only when it has
 * phrase chunks and a stress word (the hints shown to learners come from them).
 */
function s(id: string, text: string, opts?: { chunks?: string[]; stress?: string }): Sentence {
  const scorable = Boolean(opts?.chunks && opts.chunks.length >= 2 && opts.stress);
  return { id, text, chunks: opts?.chunks, stress: opts?.stress, scorable };
}

export const BUILTIN_STORIES: Story[] = [
  {
    id: 'headphones',
    title: 'The Headphones Mix-Up',
    difficulty: 'Cơ bản',
    part: 1,
    phrase: { en: 'Hold on, let me check.', vi: 'Đợi chút, để mình kiểm tra.' },
    focus: 'phrase',
    focusNote: 'Ngắt đúng sau các cụm ngắn như "I looked under the couch," và "Oh my gosh,".',
    ieltsQuestion:
      'Do you often lose things at home? What do you usually do when you cannot find something?',
    source: 'builtin',
    sentences: [
      s('h1', 'Hey, have you seen my headphones anywhere?'),
      s('h2', "I looked under the couch, in my backpack, and even in the fridge.", {
        chunks: ['I looked under the couch,', 'in my backpack,', 'and even in the fridge.'],
        stress: 'fridge',
      }),
      s('h3', 'Hold on, are those headphones around your neck right now?'),
      s('h4', "Oh my gosh, I've been wearing them the whole time.", {
        chunks: ['Oh my gosh,', "I've been wearing them", 'the whole time.'],
        stress: 'whole',
      }),
      s('h5', "Don't worry, it happens to everybody."),
      s('h6', "Yeah, next time I'll check my own head before I check the couch."),
    ],
  },
  {
    id: 'wrong-drink',
    title: 'The Wrong Drink',
    difficulty: 'Cơ bản',
    part: 1,
    phrase: { en: "I didn't want to make a fuss.", vi: 'Mình không muốn làm to chuyện.' },
    focus: 'stress',
    focusNote: 'Nhấn CHOCOLATE, từ mang ý "sai đồ uống", và BARELY, từ mang cảm xúc.',
    ieltsQuestion:
      'Do you usually order the same thing at a café, or do you like to try new things? Why?',
    source: 'builtin',
    sentences: [
      s('d1', 'I ordered an iced latte at the café, but the barista gave me a hot chocolate.', {
        chunks: ['I ordered an iced latte', 'at the café,', 'but the barista gave me', 'a hot chocolate.'],
        stress: 'chocolate',
      }),
      s('d2', "I didn't want to make a fuss, so I just took a sip."),
      s('d3', 'It was way too sweet, and I could barely finish it.', {
        chunks: ['It was way too sweet,', 'and I could barely finish it.'],
        stress: 'barely',
      }),
      s('d4', "My friend laughed and said you're not a hot chocolate person, are you?"),
      s('d5', 'I told her I was trying something new, which was a total lie.'),
      s('d6', "Next time, I'm going to speak up before I drink anything."),
    ],
  },
  {
    id: 'presenting-first',
    title: 'Presenting First',
    difficulty: 'Trung bình',
    part: 2,
    phrase: { en: 'Since when?', vi: 'Từ bao giờ vậy?' },
    focus: 'stress',
    focusNote: 'Nhấn FIRST trong câu hỏi của Mia; đó là thông tin quyết định cả đoạn.',
    ieltsQuestion:
      'Describe a time you had to speak in front of a group. What happened, and how did you feel?',
    source: 'builtin',
    sentences: [
      s('p1', 'I was standing in line for coffee when my phone buzzed with a message from our group chat.'),
      s('p2', 'It was Mia, and she sounded way too calm for someone who was about to panic.'),
      s('p3', "You know we're presenting FIRST, right?", {
        chunks: ['You know', "we're presenting FIRST,", 'right?'],
        stress: 'FIRST',
      }),
      s('p4', 'I had barely looked at our slides, so I typed back, Wait, really? Since when?'),
      s('p5', 'She said the professor had moved our slot, and we would be going before anyone else.', {
        chunks: ['She said the professor had moved our slot,', 'and we would be going before anyone else.'],
        stress: 'before',
      }),
      s('p6', 'I grabbed my coffee, sat down, and opened the slides, hoping the first ten minutes would go smoothly.'),
    ],
  },
  {
    id: 'wrong-bus',
    title: 'The Wrong Bus',
    difficulty: 'Trung bình',
    part: 2,
    phrase: { en: "I was running late.", vi: 'Mình đã trễ giờ.' },
    focus: 'rhythm',
    focusNote: 'Giữ nhịp đều trong các câu dài, không dừng lại ở giữa "ten minutes later".',
    ieltsQuestion:
      'Describe a time you got lost or made a travel mistake. Explain what happened and how you dealt with it.',
    source: 'builtin',
    sentences: [
      s('b1', 'I was running late to meet my cousin downtown, so I jumped on the first bus that stopped.'),
      s('b2', "I didn't check the sign, and about ten minutes later I realized we were heading toward the airport.", {
        chunks: ["I didn't check the sign,", 'and about ten minutes later', 'I realized we were heading', 'toward the airport.'],
        stress: 'airport',
      }),
      s('b3', "I asked the driver if this was the right route, and he just shrugged and said, Depends where you're going."),
      s('b4', 'I got off at the next stop, pulled out my phone, and watched my map reload for what felt like forever.', {
        chunks: ['I got off at the next stop,', 'pulled out my phone,', 'and watched my map reload', 'for what felt like forever.'],
        stress: 'forever',
      }),
      s('b5', 'My cousin was already waiting outside the café, and she had that look that said, Did you get lost again?'),
      s('b6', 'We laughed about it over dinner, and now she always makes me send a screenshot of my route.'),
    ],
  },
  {
    id: 'fine-text',
    title: "The Two-Word Text",
    difficulty: 'Nâng cao',
    part: 3,
    phrase: { en: "I'm just wiped out.", vi: 'Mình chỉ đang rất mệt.' },
    focus: 'phrase',
    focusNote: 'Ngắt theo mệnh đề khi giải thích lý do, đặc biệt ở câu có "even when".',
    ieltsQuestion:
      'Do you think people communicate more clearly through text messages than in person? Why or why not?',
    source: 'builtin',
    sentences: [
      s('f1', "Last night, I sent a quick message to our group chat after a long day, and I typed only two words: I'm fine."),
      s('f2', 'I meant it honestly, because I was tired and did not want to write a long explanation about my week.'),
      s('f3', 'Within minutes, my roommate replied with a worried emoji, and my best friend asked whether I was still upset about the movie.'),
      s('f4', 'I realized that in text, a short reply can sound cold, even when the person is simply exhausted and wants a quiet evening.', {
        chunks: ['I realized that in text,', 'a short reply can sound cold,', 'even when the person is simply exhausted', 'and wants a quiet evening.'],
        stress: 'cold',
      }),
      s('f5', "Now I try to add a little more detail, like I'm fine, just wiped out, talk tomorrow, so nobody has to guess how I feel.", {
        chunks: ["Now I try to add a little more detail,", "like I'm fine, just wiped out,", 'talk tomorrow,', 'so nobody has to guess how I feel.'],
        stress: 'guess',
      }),
      s('f6', 'Honestly, I think short messages create more misunderstandings than people expect, especially between friends who joke a lot.'),
    ],
  },
  {
    id: 'viral-restaurant',
    title: 'The Viral Restaurant',
    difficulty: 'Nâng cao',
    part: 3,
    phrase: { en: "We weren't on the same page.", vi: 'Chúng mình không cùng suy nghĩ.' },
    focus: 'stress',
    focusNote: 'Nhấn AFFORDABLE và NEVER, hai từ mang lập trường của từng người và của cả nhóm.',
    ieltsQuestion:
      'Why do some places become popular on social media? Do you think people should trust online reviews?',
    source: 'builtin',
    sentences: [
      s('v1', 'We picked a restaurant just because it looked amazing in a viral video, with glowing lights and a line around the block.'),
      s('v2', 'When we finally got there, Jake expected a quick snack, Sara wanted a romantic dinner, and I was hoping for something affordable.', {
        chunks: ['When we finally got there,', 'Jake expected a quick snack,', 'Sara wanted a romantic dinner,', 'and I was hoping for something affordable.'],
        stress: 'affordable',
      }),
      s('v3', 'The menu was short, the portions were tiny, and the waiter kept saying the famous dish was sold out.'),
      s('v4', 'Honestly, nobody was upset, but we realized we had never actually talked about what we wanted from the night.', {
        chunks: ['Honestly, nobody was upset,', 'but we realized', 'we had never actually talked', 'about what we wanted from the night.'],
        stress: 'never',
      }),
      s('v5', 'So next time, we are going to decide on the goal first, then choose the place that fits everyone.'),
      s('v6', 'That way, a viral video can inspire us without deciding everything for us.'),
    ],
  },
];
