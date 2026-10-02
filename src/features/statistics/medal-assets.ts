import type { Timeframe } from '../../core/domain';
import type { MedalTier } from './logic';

export const medalAssets: Record<Timeframe, Record<MedalTier, number>> = {
  day: {
    bronze: require('../../assets/medals/medal_day_bronze.png'),
    silver: require('../../assets/medals/medal_day_silver.png'),
    gold: require('../../assets/medals/medal_day_gold.png'),
  },
  week: {
    bronze: require('../../assets/medals/medal_week_bronze.png'),
    silver: require('../../assets/medals/medal_week_silver.png'),
    gold: require('../../assets/medals/medal_week_gold.png'),
  },
  month: {
    bronze: require('../../assets/medals/medal_month_bronze.png'),
    silver: require('../../assets/medals/medal_month_silver.png'),
    gold: require('../../assets/medals/medal_month_gold.png'),
  },
};
