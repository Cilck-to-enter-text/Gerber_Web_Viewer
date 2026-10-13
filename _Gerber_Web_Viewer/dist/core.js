/* Gerber conversion shared by the browser worker and validation runner. */
(function (scope) {
  scope.convertGerber = function (text, id) {
    return new Promise((resolve, reject) => {
      const warningGroups = new Map();
      // PADS emits a zero-origin declaration that the upstream parser treats as a hit.
      // At the start of an absolute drill program this declaration does not move the origin.
      if (/M48/i.test(text)) {
        const origin = text.match(/^G93[^\r\n]*/gm) || [];
        if (origin.some(line => !/^G93X0+(?:\.0+)?Y0+(?:\.0+)?\s*$/.test(line))) {
          return reject(new Error('暂不支持 G93 非零钻孔原点偏移，请导出绝对坐标的 Excellon 文件。'));
        }
        text = text.replace(/^G93X0+(?:\.0+)?Y0+(?:\.0+)?\s*$/gm, '');
      }
      let converter;
      try {
        converter = scope.gerberToSvg(text, { id }, (error, svg) => {
          if (error) return reject(error);
          const warnings = [...warningGroups.values()].map(w => `行 ${w.line}: ${w.message}${w.count > 1 ? `（共 ${w.count} 次）` : ''}`);
          resolve({ svg, units: converter.units, warnings, empty: !converter.layer.length });
        });
        converter.on('warning', w => {
          const existing = warningGroups.get(w.message);
          if (existing) existing.count++;
          else if (warningGroups.size < 100) warningGroups.set(w.message, { ...w, count: 1 });
          else if (!warningGroups.has('truncated')) warningGroups.set('truncated', { line: '—', message: '提示种类过多，后续提示已省略。', count: 1 });
        });
      } catch (error) { reject(error); }
    });
  };
  scope.gerberBoxMm = function (vb, units) {
    const k = units === 'in' ? 25.4 / 1000 : 1 / 1000;
    // SVG's layer-local reflection must be aligned about the same board origin.
    return [vb[0] * k, -(vb[1] + vb[3]) * k, vb[2] * k, vb[3] * k];
  };
})(globalThis);
