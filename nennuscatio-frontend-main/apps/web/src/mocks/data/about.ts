import { assets } from "./assets";

/** Reference-led presentation copy, not independently verified company history. */
export const aboutCopy = {
  heroLineOne: { en: "A little love.", ar: "قليل من الحب." },
  heroLineTwo: { en: "A whole world of care.", ar: "وعالم كامل من الرعاية." },
  heroDescription: {
    en: "Nennus Catio began with a simple belief: our pets deserve care that feels as thoughtful as the love they give us.",
    ar: "بدأت Nennus Catio بإيمان بسيط: حيواناتنا الأليفة تستحق رعاية مدروسة تليق بالحب الذي تمنحنا إياه.",
  },
  storyLineOne: { en: "It started with cats.", ar: "بدأت الحكاية مع القطط." },
  storyLineTwo: {
    en: "And grew into something more.",
    ar: "ثم نمت لتصبح أكثر من ذلك.",
  },
  storyParagraphs: [
    {
      en: "Nennus Catio was created around a genuine love for cats and a desire to make caring for them simpler, better and more thoughtful.",
      ar: "نشأت Nennus Catio من حب حقيقي للقطط ورغبة في جعل العناية بها أبسط وأفضل وأكثر اهتماماً.",
    },
    {
      en: "What began with everyday essentials has grown into a wider world of care — from trusted products and professional grooming to thoughtfully designed pet houses.",
      ar: "ما بدأ بالمستلزمات اليومية توسّع إلى عالم أرحب من الرعاية، من المنتجات الموثوقة والعناية الاحترافية إلى بيوت الحيوانات المصممة بعناية.",
    },
    { en: "And we’re still growing.", ar: "وما زلنا ننمو." },
  ],
  values: [
    {
      id: "care",
      title: { en: "Thoughtful Care", ar: "رعاية باهتمام" },
      description: {
        en: "Every product, service and experience should make life a little better for pets and the people who love them.",
        ar: "كل منتج وخدمة وتجربة يجب أن تجعل الحياة أفضل للحيوانات الأليفة ولمن يحبونها.",
      },
      image: assets.contactHero,
      alt: {
        en: "A fluffy cat enjoying a gentle touch",
        ar: "قطة تستمتع بلمسة حانية",
      },
    },
    {
      id: "expertise",
      title: { en: "Trusted Expertise", ar: "خبرة موثوقة" },
      description: {
        en: "From grooming to everyday essentials, we believe good care starts with people and products you can trust.",
        ar: "من العناية إلى المستلزمات اليومية، نؤمن بأن الرعاية الجيدة تبدأ بأشخاص ومنتجات يمكنك الوثوق بهم.",
      },
      image: assets.aboutExpertise,
      alt: {
        en: "A golden retriever being gently brushed",
        ar: "كلب غولدن ريتريفر يتم تمشيطه بلطف",
      },
    },
    {
      id: "comfort",
      title: { en: "Made Around Them", ar: "مصمّم لأجلهم" },
      description: {
        en: "Every pet is different. Their care, comfort and spaces should be too.",
        ar: "كل حيوان أليف مختلف، وكذلك يجب أن تكون رعايته وراحته ومساحته الخاصة.",
      },
      image: assets.aboutComfort,
      alt: {
        en: "A cat relaxing inside a cardboard pet house",
        ar: "قطة تستريح داخل بيت من الورق المقوّى",
      },
    },
  ],
  homeLineOne: { en: "Born in Qatar.", ar: "من قطر." },
  homeLineTwo: {
    en: "Built around the pets we love.",
    ar: "لأجل الحيوانات التي نحبها.",
  },
  homeDescription: {
    en: "Nennus Catio is proudly based in Qatar, built around the pets, people and everyday realities of life here. From products and services to spaces, education and community, our goal is simple: to make thoughtful pet care easier, and a little brighter, for every pet and the people who love them.",
    ar: "نفخر بأن Nennus Catio تنطلق من قطر، حول الحيوانات والأشخاص وتفاصيل الحياة اليومية هنا. من المنتجات والخدمات إلى المساحات والتوعية والمجتمع، هدفنا بسيط: جعل العناية المدروسة بالحيوانات أسهل وأكثر إشراقاً لكل حيوان ولمن يحبونه.",
  },
} as const;
