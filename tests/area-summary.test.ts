import {describe,expect,it} from 'vitest';
import {pickPage,tidyExtract} from '../src/lib/server/areaSummary';

const whitefield={latitude:53.55,longitude:-2.30};
describe('area write-ups',()=>{
  it('uses only an article located near the area, never a same-named place elsewhere or a disambiguation page',()=>{
    const pages=[
      {title:'Whitefield, Maine',index:1,extract:'Whitefield is a town in Maine.',coordinates:[{lat:44.17,lon:-69.62}]},
      {title:'Whitefield',index:2,extract:'Whitefield may refer to:',coordinates:[{lat:53.55,lon:-2.30}],pageprops:{disambiguation:''}},
      {title:'Whitefield, Greater Manchester',index:3,extract:'Whitefield is a town in Bury.',coordinates:[{lat:53.552,lon:-2.299}]},
    ];
    expect(pickPage(pages,whitefield)?.title).toBe('Whitefield, Greater Manchester');
    expect(pickPage(pages.slice(0,2),whitefield)).toBeUndefined();
  });
  it('drops the pronunciation bracket and keeps the write-up short',()=>{
    expect(tidyExtract('Rochdale ( ROTCH-dayl) is a large town in Greater Manchester, England. It is on the River Roch. It has a long history.'))
      .toBe('Rochdale is a large town in Greater Manchester, England. It is on the River Roch. It has a long history.');
    expect(tidyExtract('Whitefield is a town in Bury, England. It is 6 miles (10.0 km) northwest of Manchester.')).toBe('Whitefield is a town in Bury, England. It is 6 miles (10.0 km) northwest of Manchester.');
    const long=tidyExtract('A is a place. '+'It has many things to say about itself at great length. '.repeat(10));
    expect(long.length).toBeLessThanOrEqual(320);expect(long.endsWith('.')).toBe(true);
  });
});
