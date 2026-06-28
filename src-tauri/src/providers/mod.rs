//! Market-data providers. Taiwan is served by FinMind (EOD history, institutional
//! flows) and Fugle (realtime quotes / order book). The data layer is split by
//! provider so additional markets (e.g. US via Yahoo Finance) can be added later
//! without touching the cache or command layer.

pub mod finmind;
pub mod fugle;
