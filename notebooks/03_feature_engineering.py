import pandas as pd
from pathlib import Path

from claimpilot.data.validators import validate_dataset
from claimpilot.data.preprocessor import DataCleaner, encode_targets
from claimpilot.features.engineer import engineer_features
from claimpilot.features import sets

RAW_PATH = Path('data/raw/insurance_fraud_car.csv')
PROC_DIR = Path('data/processed')

df = pd.read_csv(RAW_PATH)
print('Loaded:', df.shape)
validate_dataset(df.copy())
df = DataCleaner(df).clean()
df = encode_targets(df)
df = engineer_features(df)
print('After clean+feat:', df.shape)

# save
PROC_DIR.mkdir(exist_ok=True)
df.to_csv(PROC_DIR / 'processed_all.csv', index=False)
print('Saved:', PROC_DIR / 'processed_all.csv')
