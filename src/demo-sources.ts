/** Every molecule placed in the development world and covered by geometry tests. */
export const DEMO_SOURCES: ReadonlyArray<readonly [number, number, string]> = [
  [0, 0, 'O'],
  [3, 0, 'CCO'],
  [0, 3, 'c1ccccc1'],
  [-3, 2, 'O=C=O'],
  [2, -3, 'CC(=O)O'],
  [-4, -2, 'N'],
  [5, 3, 'Oc1ccccc1'],
  [6, -2, 'c1ccc2ccccc2c1'],
  [-6, 3, 'C1C[C@H](NC1)C(=O)O'],
  [4, 5, 'Nc1ncnc2[nH]cnc12'],
  [-5, 5, 'Cc1c[nH]c(=O)[nH]c1=O'],
  [8, 4, 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C'],
  [-8, -4, 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O'],
  [-6, -4, 'N[C@@H](C)C(=O)O'],
];
