# ClaimPilot AI - Module 2 EDA Script
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os

df = pd.read_csv('data/raw/insurance_fraud_car.csv')
print(df.shape)
print(df.head(2))
