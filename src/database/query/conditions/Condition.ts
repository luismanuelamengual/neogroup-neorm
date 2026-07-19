import { ArrayContainsCondition } from './ArrayContainsCondition'
import { BasicCondition } from './BasicCondition'
import { ColumnCondition } from './ColumnCondition'
import { ConditionGroup } from './ConditionGroup'
import { ExistsCondition } from './ExistsCondition'
import { RawCondition } from './RawCondition'

export type Condition =
  | RawCondition
  | BasicCondition
  | ColumnCondition
  | ArrayContainsCondition
  | ConditionGroup
  | ExistsCondition
  | ((group: ConditionGroup) => void)
