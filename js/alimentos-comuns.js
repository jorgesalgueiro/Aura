/* ==========================================================================
   alimentos-comuns.js — tabela pequena para pesquisa offline
   --------------------------------------------------------------------------
   Valores aproximados por 100 g (ou 100 ml, quando `unidade` é 'ml').
   Não substituem o rótulo do produto: servem para quando não há rede ou
   para alimentos simples que não têm código de barras. O utilizador pode
   criar alimentos personalizados com os valores exatos que quiser.
   ========================================================================== */

export const ALIMENTOS_COMUNS = [
  // Pão e cereais
  { nome: 'Pão de forma',            kcal100: 250, unidade: 'g',  dose: 30,  grupo: 'Pão e cereais' },
  { nome: 'Pão integral',            kcal100: 247, unidade: 'g',  dose: 30,  grupo: 'Pão e cereais' },
  { nome: 'Pão de mistura',          kcal100: 270, unidade: 'g',  dose: 50,  grupo: 'Pão e cereais' },
  { nome: 'Tosta',                   kcal100: 400, unidade: 'g',  dose: 8,   grupo: 'Pão e cereais' },
  { nome: 'Arroz cozido',            kcal100: 130, unidade: 'g',  dose: 150, grupo: 'Pão e cereais' },
  { nome: 'Massa cozida',            kcal100: 158, unidade: 'g',  dose: 180, grupo: 'Pão e cereais' },
  { nome: 'Batata cozida',           kcal100: 87,  unidade: 'g',  dose: 150, grupo: 'Pão e cereais' },
  { nome: 'Batata frita',            kcal100: 312, unidade: 'g',  dose: 100, grupo: 'Pão e cereais' },
  { nome: 'Aveia',                   kcal100: 389, unidade: 'g',  dose: 40,  grupo: 'Pão e cereais' },
  { nome: 'Cereais de pequeno-almoço', kcal100: 380, unidade: 'g', dose: 30, grupo: 'Pão e cereais' },
  { nome: 'Croissant',               kcal100: 406, unidade: 'g',  dose: 60,  grupo: 'Pão e cereais' },

  // Proteínas
  { nome: 'Frango grelhado',         kcal100: 165, unidade: 'g',  dose: 120, grupo: 'Proteínas' },
  { nome: 'Peru grelhado',           kcal100: 135, unidade: 'g',  dose: 120, grupo: 'Proteínas' },
  { nome: 'Ovo cozido',              kcal100: 155, unidade: 'g',  dose: 50,  grupo: 'Proteínas' },
  { nome: 'Ovo mexido',              kcal100: 149, unidade: 'g',  dose: 100, grupo: 'Proteínas' },
  { nome: 'Atum em água',            kcal100: 116, unidade: 'g',  dose: 100, grupo: 'Proteínas' },
  { nome: 'Salmão',                  kcal100: 208, unidade: 'g',  dose: 120, grupo: 'Proteínas' },
  { nome: 'Bacalhau cozido',         kcal100: 105, unidade: 'g',  dose: 120, grupo: 'Proteínas' },
  { nome: 'Carne de vaca magra',     kcal100: 187, unidade: 'g',  dose: 120, grupo: 'Proteínas' },
  { nome: 'Queijo flamengo',         kcal100: 330, unidade: 'g',  dose: 30,  grupo: 'Proteínas' },

  // Laticínios
  { nome: 'Leite meio-gordo',        kcal100: 47,  unidade: 'ml', dose: 200, grupo: 'Laticínios' },
  { nome: 'Iogurte natural',         kcal100: 61,  unidade: 'g',  dose: 125, grupo: 'Laticínios' },
  { nome: 'Iogurte grego',           kcal100: 97,  unidade: 'g',  dose: 150, grupo: 'Laticínios' },
  { nome: 'Manteiga',                kcal100: 717, unidade: 'g',  dose: 10,  grupo: 'Laticínios' },

  // Fruta
  { nome: 'Banana',                  kcal100: 89,  unidade: 'g',  dose: 120, grupo: 'Fruta' },
  { nome: 'Maçã',                    kcal100: 52,  unidade: 'g',  dose: 150, grupo: 'Fruta' },
  { nome: 'Laranja',                 kcal100: 47,  unidade: 'g',  dose: 150, grupo: 'Fruta' },
  { nome: 'Pera',                    kcal100: 57,  unidade: 'g',  dose: 150, grupo: 'Fruta' },
  { nome: 'Morangos',                kcal100: 32,  unidade: 'g',  dose: 100, grupo: 'Fruta' },
  { nome: 'Uvas',                    kcal100: 69,  unidade: 'g',  dose: 100, grupo: 'Fruta' },
  { nome: 'Abacate',                 kcal100: 160, unidade: 'g',  dose: 100, grupo: 'Fruta' },

  // Legumes e sopa
  { nome: 'Tomate',                  kcal100: 18,  unidade: 'g',  dose: 100, grupo: 'Legumes' },
  { nome: 'Cenoura',                 kcal100: 41,  unidade: 'g',  dose: 80,  grupo: 'Legumes' },
  { nome: 'Brócolos',                kcal100: 34,  unidade: 'g',  dose: 100, grupo: 'Legumes' },
  { nome: 'Alface',                  kcal100: 15,  unidade: 'g',  dose: 50,  grupo: 'Legumes' },
  { nome: 'Sopa de legumes',         kcal100: 40,  unidade: 'ml', dose: 300, grupo: 'Legumes' },

  // Leguminosas
  { nome: 'Feijão cozido',           kcal100: 127, unidade: 'g',  dose: 100, grupo: 'Leguminosas' },
  { nome: 'Grão cozido',             kcal100: 164, unidade: 'g',  dose: 100, grupo: 'Leguminosas' },
  { nome: 'Lentilhas cozidas',       kcal100: 116, unidade: 'g',  dose: 100, grupo: 'Leguminosas' },

  // Gorduras e oleaginosas
  { nome: 'Azeite',                  kcal100: 884, unidade: 'ml', dose: 10,  grupo: 'Gorduras' },
  { nome: 'Amêndoas',                kcal100: 579, unidade: 'g',  dose: 30,  grupo: 'Gorduras' },
  { nome: 'Nozes',                   kcal100: 654, unidade: 'g',  dose: 30,  grupo: 'Gorduras' },

  // Doces e refeições rápidas
  { nome: 'Açúcar',                  kcal100: 400, unidade: 'g',  dose: 5,   grupo: 'Doces e refeições' },
  { nome: 'Mel',                     kcal100: 304, unidade: 'g',  dose: 20,  grupo: 'Doces e refeições' },
  { nome: 'Chocolate preto',         kcal100: 546, unidade: 'g',  dose: 20,  grupo: 'Doces e refeições' },
  { nome: 'Bolacha Maria',           kcal100: 436, unidade: 'g',  dose: 10,  grupo: 'Doces e refeições' },
  { nome: 'Gelado',                  kcal100: 207, unidade: 'g',  dose: 100, grupo: 'Doces e refeições' },
  { nome: 'Pizza',                   kcal100: 266, unidade: 'g',  dose: 200, grupo: 'Doces e refeições' },
  { nome: 'Hambúrguer',              kcal100: 254, unidade: 'g',  dose: 150, grupo: 'Doces e refeições' },

  // Bebidas
  { nome: 'Sumo de laranja',         kcal100: 45,  unidade: 'ml', dose: 200, grupo: 'Bebidas' },
  { nome: 'Refrigerante',            kcal100: 42,  unidade: 'ml', dose: 330, grupo: 'Bebidas' },
  { nome: 'Café com leite',          kcal100: 35,  unidade: 'ml', dose: 200, grupo: 'Bebidas' },
];
