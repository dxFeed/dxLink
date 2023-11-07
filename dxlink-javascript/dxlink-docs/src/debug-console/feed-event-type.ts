export enum EventType {
  Quote = 'Quote',
  Candle = 'Candle',
  DailyCandle = 'DailyCandle',
  Trade = 'Trade',
  TradeETH = 'TradeETH',
  Summary = 'Summary',
  Profile = 'Profile',
  Greeks = 'Greeks',
  TheoPrice = 'TheoPrice',
  TimeAndSale = 'TimeAndSale',
  Underlying = 'Underlying',
  AnalyticOrder = 'AnalyticOrder',
  SpreadOrder = 'SpreadOrder',
  OptionSale = 'OptionSale',
  Order = 'Order',
  Series = 'Series',
  Configuration = 'Configuration',
  Message = 'Message',
}

export const EVENT_TYPES = Object.values(EventType)
