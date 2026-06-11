import {
  parseKnittingTimeFromSintralText,
  parsePartBaseFromSintralText,
  parseSimulationStatsFromSintralText,
  parseSintralWindowPayload,
} from '../server/sintral-screen.ts';

const text = `load C:/Stoll/Tmp/5469-POLO-LISTRADA-VITORIA-CT.sin C:/Stoll/Tmp/5469-POLO-LISTRADA-VITORIA-CT.jac C:/Stoll/Tmp/5469-POLO-LISTRADA-VITORIA-CT.setx
Tempo de tricotagem calculado:11 min  11 sec  +/- 5 % (CL=200)
Cursos:		  628
Rendimento sistema:	 35 %
Simulação OK`;

console.log('parte', parsePartBaseFromSintralText(text));
console.log('tempo', parseKnittingTimeFromSintralText(text));
console.log('stats', parseSimulationStatsFromSintralText(text));
console.log(
  'payload',
  parseSintralWindowPayload({
    running: true,
    lines: text.split('\n').map((line) => `Edit :: ${line}`),
  })
);
