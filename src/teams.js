// The six haunted house teams, in the order visitors walk through them.
// Colors come from the team concept board.
export const TEAMS = [
  { id: "poison-breakfast", name: "Poison Breakfast", color: "#3A9D4F" },
  { id: "hallway-library", name: "Hallway/Library", color: "#2F6FBF" },
  { id: "lost-found", name: "Lost & Found Playground", color: "#6B3FA0" },
  { id: "schoolyard", name: "Schoolyard Dangers", color: "#D8402C" },
  { id: "garden", name: "Garden", color: "#D99A12" },
  { id: "exit", name: "Exit", color: "#D63C8A" },
];

export function teamById(id) {
  return TEAMS.find((team) => team.id === id);
}
