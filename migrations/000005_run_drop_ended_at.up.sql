-- Run の終了時刻は duration_sec から計算する方針に変更したため、
-- ended_at カラムを廃止。依存していた CHECK 制約も一緒に消える。
ALTER TABLE runs DROP COLUMN ended_at;
