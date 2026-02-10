export const dxScriptCompletions = [
  // Built-in series / special vars
  { caption: 'time', value: 'time', meta: 'series' },
  { caption: 'open', value: 'open', meta: 'series' },
  { caption: 'high', value: 'high', meta: 'series' },
  { caption: 'low', value: 'low', meta: 'series' },
  { caption: 'close', value: 'close', meta: 'series' },
  { caption: 'volume', value: 'volume', meta: 'series' },
  { caption: 'bidVolume', value: 'bidVolume', meta: 'series' },
  { caption: 'askVolume', value: 'askVolume', meta: 'series' },
  { caption: 'count', value: 'count', meta: 'series' },
  { caption: 'vwap', value: 'vwap', meta: 'series' },
  { caption: 'impVolatility', value: 'impVolatility', meta: 'series' },
  { caption: 'openInterest', value: 'openInterest', meta: 'series' },
  { caption: 'hl2', value: 'hl2', meta: 'series' },
  { caption: 'hlc3', value: 'hlc3', meta: 'series' },
  { caption: 'ohlc4', value: 'ohlc4', meta: 'series' },
  { caption: 'bar_index', value: 'bar_index', meta: 'variable' },

  // Script lifecycle
  { caption: 'onTick', value: 'onTick', meta: 'lifecycle' },

  // Namespaces / modules
  { caption: 'bar', value: 'bar', meta: 'module' },
  { caption: 'color', value: 'color', meta: 'module' },
  { caption: 'input', value: 'input', meta: 'module' },
  { caption: 'session', value: 'session', meta: 'module' },
  { caption: 'ta', value: 'ta', meta: 'module' },
  { caption: 'box', value: 'box', meta: 'module' },
  { caption: 'line', value: 'line', meta: 'module' },
  { caption: 'polyline', value: 'polyline', meta: 'module' },
  { caption: 'label', value: 'label', meta: 'module' },
  { caption: 'hline', value: 'hline', meta: 'module' },

  // Core / outputs
  { caption: 'ts', value: 'ts', meta: 'function' },
  { caption: 'spline', value: 'spline', meta: 'function' },
  { caption: 'output', value: 'output', meta: 'function' },

  // bar.*
  { caption: 'bar.index', value: 'bar.index', meta: 'function' },
  { caption: 'bar.isNew', value: 'bar.isNew', meta: 'function' },
  { caption: 'bar.isConfirmed', value: 'bar.isConfirmed', meta: 'function' },
  { caption: 'bar.isHistory', value: 'bar.isHistory', meta: 'function' },
  { caption: 'bar.isNewDay', value: 'bar.isNewDay', meta: 'function' },
  { caption: 'bar.isNewWeek', value: 'bar.isNewWeek', meta: 'function' },
  { caption: 'bar.isNewMonth', value: 'bar.isNewMonth', meta: 'function' },

  // input.*
  { caption: 'input', value: 'input', meta: 'function' },
  { caption: 'input.bool', value: 'input.bool', meta: 'function' },
  { caption: 'input.double', value: 'input.double', meta: 'function' },
  { caption: 'input.string', value: 'input.string', meta: 'function' },
  { caption: 'input.source', value: 'input.source', meta: 'function' },
  { caption: 'input.color', value: 'input.color', meta: 'function' },
  { caption: 'input.session', value: 'input.session', meta: 'function' },
  { caption: 'input.map', value: 'input.map', meta: 'function' },

  // color.*
  { caption: 'color.create', value: 'color.create', meta: 'function' },

  // session object
  { caption: 'session.contains', value: 'session.contains', meta: 'method' },

  // series object
  { caption: 'series.set', value: 'series.set', meta: 'method' },

  // ta.*
  { caption: 'ta.sum', value: 'ta.sum', meta: 'function' },
  { caption: 'ta.cum', value: 'ta.cum', meta: 'function' },
  { caption: 'ta.sma', value: 'ta.sma', meta: 'function' },
  { caption: 'ta.ema', value: 'ta.ema', meta: 'function' },
  { caption: 'ta.wma', value: 'ta.wma', meta: 'function' },
  { caption: 'ta.wima', value: 'ta.wima', meta: 'function' },
  { caption: 'ta.highest', value: 'ta.highest', meta: 'function' },
  { caption: 'ta.highestBar', value: 'ta.highestBar', meta: 'function' },
  { caption: 'ta.lowest', value: 'ta.lowest', meta: 'function' },
  { caption: 'ta.lowestBar', value: 'ta.lowestBar', meta: 'function' },
  { caption: 'ta.pivotHigh', value: 'ta.pivotHigh', meta: 'function' },
  { caption: 'ta.pivotLow', value: 'ta.pivotLow', meta: 'function' },

  // drawing modules
  { caption: 'box.create', value: 'box.create', meta: 'function' },
  { caption: 'box.allBoxes', value: 'box.allBoxes', meta: 'function' },
  { caption: 'line.create', value: 'line.create', meta: 'function' },
  { caption: 'line.allLines', value: 'line.allLines', meta: 'function' },
  { caption: 'polyline.create', value: 'polyline.create', meta: 'function' },
  { caption: 'polyline.allPolylines', value: 'polyline.allPolylines', meta: 'function' },
  { caption: 'label.create', value: 'label.create', meta: 'function' },
  { caption: 'label.allLabels', value: 'label.allLabels', meta: 'function' },
  { caption: 'hline.create', value: 'hline.create', meta: 'function' },
  { caption: 'hline.allLines', value: 'hline.allLines', meta: 'function' },

  // Color constants (color.*)
  { caption: 'color.BLACK', value: 'color.BLACK', meta: 'constant' },
  { caption: 'color.WHITE', value: 'color.WHITE', meta: 'constant' },
  { caption: 'color.RED', value: 'color.RED', meta: 'constant' },
  { caption: 'color.GREEN', value: 'color.GREEN', meta: 'constant' },
  { caption: 'color.BLUE', value: 'color.BLUE', meta: 'constant' },
  { caption: 'color.YELLOW', value: 'color.YELLOW', meta: 'constant' },
  { caption: 'color.ORANGE', value: 'color.ORANGE', meta: 'constant' },
  { caption: 'color.PURPLE', value: 'color.PURPLE', meta: 'constant' },
  { caption: 'color.GRAY', value: 'color.GRAY', meta: 'constant' },
  { caption: 'color.SILVER', value: 'color.SILVER', meta: 'constant' },
  { caption: 'color.MAROON', value: 'color.MAROON', meta: 'constant' },
  { caption: 'color.LIME', value: 'color.LIME', meta: 'constant' },
  { caption: 'color.NAVY', value: 'color.NAVY', meta: 'constant' },
  { caption: 'color.TEAL', value: 'color.TEAL', meta: 'constant' },
  { caption: 'color.CYAN', value: 'color.CYAN', meta: 'constant' },
  { caption: 'color.MAGENTA', value: 'color.MAGENTA', meta: 'constant' },
  { caption: 'color.PINK', value: 'color.PINK', meta: 'constant' },
  { caption: 'color.GOLD', value: 'color.GOLD', meta: 'constant' },
  { caption: 'color.CORAL', value: 'color.CORAL', meta: 'constant' },
  { caption: 'color.CRIMSON', value: 'color.CRIMSON', meta: 'constant' },

  // spline.STYLE_*
  { caption: 'spline.STYLE_LINE', value: 'spline.STYLE_LINE', meta: 'constant' },
  { caption: 'spline.STYLE_STEPLINE', value: 'spline.STYLE_STEPLINE', meta: 'constant' },
  { caption: 'spline.STYLE_HISTOGRAM', value: 'spline.STYLE_HISTOGRAM', meta: 'constant' },
  { caption: 'spline.STYLE_CROSS', value: 'spline.STYLE_CROSS', meta: 'constant' },
  { caption: 'spline.STYLE_AREA', value: 'spline.STYLE_AREA', meta: 'constant' },
  { caption: 'spline.STYLE_COLUMNS', value: 'spline.STYLE_COLUMNS', meta: 'constant' },
  { caption: 'spline.STYLE_CIRCLES', value: 'spline.STYLE_CIRCLES', meta: 'constant' },
  { caption: 'spline.STYLE_LINE_BREAK', value: 'spline.STYLE_LINE_BREAK', meta: 'constant' },
  { caption: 'spline.STYLE_AREA_BREAK', value: 'spline.STYLE_AREA_BREAK', meta: 'constant' },
  { caption: 'spline.STYLE_STEPLINE_BREAK', value: 'spline.STYLE_STEPLINE_BREAK', meta: 'constant' },

  // Enum/string values used in options (LineStyle / LineExtend / BoxExtend / Align / XLocation / TextFormatting)
  { caption: 'SOLID', value: 'SOLID', meta: 'enum' },
  { caption: 'DOTTED', value: 'DOTTED', meta: 'enum' },
  { caption: 'DASHED', value: 'DASHED', meta: 'enum' },
  { caption: 'ARROW_LEFT', value: 'ARROW_LEFT', meta: 'enum' },
  { caption: 'ARROW_RIGHT', value: 'ARROW_RIGHT', meta: 'enum' },
  { caption: 'ARROW_BOTH', value: 'ARROW_BOTH', meta: 'enum' },

  { caption: 'NONE', value: 'NONE', meta: 'enum' },
  { caption: 'LEFT', value: 'LEFT', meta: 'enum' },
  { caption: 'RIGHT', value: 'RIGHT', meta: 'enum' },
  { caption: 'BOTH', value: 'BOTH', meta: 'enum' },

  { caption: 'INDEX', value: 'INDEX', meta: 'enum' },
  { caption: 'TIME', value: 'TIME', meta: 'enum' },

  { caption: 'TOP', value: 'TOP', meta: 'enum' },
  { caption: 'CENTER', value: 'CENTER', meta: 'enum' },
  { caption: 'BOTTOM', value: 'BOTTOM', meta: 'enum' },

  { caption: 'BOLD', value: 'BOLD', meta: 'enum' },
  { caption: 'ITALIC', value: 'ITALIC', meta: 'enum' },
]
