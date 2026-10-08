/* Problem-based course data for Operating Systems. Chapters register themselves from chapters/chNN.js into COURSE.chapters[N]. */
window.COURSE = {
  name: `Operating Systems`,
  kick: `9 chapters · problem-based · Linux 6.x on x86-64`,
  lead: `A shared build server runs 200 programs from different teams on 4 cores, 8 GB of RAM and one disk. Some programs loop forever, some leak memory, some are killed by a power cut halfway through a write. Each chapter starts from one incident on this machine, asks you to predict the outcome, then animates the kernel mechanism underneath and ends with the symptoms you will see in production. Threads, locks and async runtimes live in the Concurrency course; this course is the kernel below them.`,
  chapters: []
};
