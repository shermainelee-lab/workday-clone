// The SRA Performance Appraisal Form: core competencies, the 3-point rating scale and KPI progress options.
export const COMPETENCIES: { key: string; name: string; hint: string }[] = [
  { key: "quality", name: "Quality of Work and Accountability", hint: "Accuracy, reliability, ownership of tasks, follow-through and meeting agreed deadlines." },
  { key: "communication", name: "Communication and Stakeholder Management", hint: "Clear and timely communication; professionalism when engaging members, partners, clients and other stakeholders." },
  { key: "teamwork", name: "Teamwork and Collaboration", hint: "Cooperation, information-sharing, support for colleagues and contribution to team objectives." },
  { key: "initiative", name: "Initiative and Problem-Solving", hint: "Ability to identify issues, propose practical solutions, exercise sound judgement and work independently at an appropriate level." },
  { key: "adaptability", name: "Adaptability and Continuous Improvement", hint: "Openness to change, willingness to learn, adoption of new tools or processes and efforts to improve work practices." },
];

export const RATING_LABEL: Record<number, string> = {
  3: "3 - Exceeds Expectations",
  2: "2 - Meets Expectations",
  1: "1 - Needs Improvement",
};

export const RATING_HELP: Record<number, string> = {
  3: "Consistently exceeds the requirements of the role and delivers strong results, including contributions beyond normal responsibilities.",
  2: "Meets the requirements of the role and delivers the expected results and responsibilities effectively.",
  1: "Does not consistently meet the requirements of the role; improvement is required in one or more areas of performance.",
};

export const KPI_STATUS = ["Not started", "In progress", "Achieved", "Exceeded"];
export const KIND_LABEL: Record<string, string> = { mid_year: "Mid-Year Review (May)", year_end: "Year-End Review (November)" };
