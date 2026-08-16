import os
from processing import preprocess
import pickle
import pandas as pd
import streamlit as st
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
@st.cache_data(show_spinner=False)
def load_dataframes():
    pickle_file_path = r'Files/new_df_dict.pkl'
    if os.path.exists(pickle_file_path):
        with open(r'Files/movies_dict.pkl', 'rb') as f:
            movies = pd.DataFrame.from_dict(pickle.load(f))
        with open(r'Files/movies2_dict.pkl', 'rb') as f:
            movies2 = pd.DataFrame.from_dict(pickle.load(f))
        with open(pickle_file_path, 'rb') as f:
            new_df = pd.DataFrame.from_dict(pickle.load(f))
        return new_df, movies, movies2
    else:
        movies, new_df, movies2 = preprocess.read_csv_to_df()
        return new_df, movies, movies2

@st.cache_data(show_spinner=False)
def load_similarity(col_name, _new_df):
    pickle_file_path = fr'Files/similarity_tags_{col_name}.pkl'
    if os.path.exists(pickle_file_path):
        with open(pickle_file_path, 'rb') as f:
            return pickle.load(f)
    else:
        cv = CountVectorizer(max_features=5000, stop_words='english')
        vec_tags = cv.fit_transform(_new_df[col_name]).toarray()
        sim_bt = cosine_similarity(vec_tags)
        return sim_bt

class Main():
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        pass

    def __init__(self):
        self.new_df = None
        self.movies = None
        self.movies2 = None

    def getter(self):
        return self.new_df, self.movies, self.movies2

    def main_(self):
        # Load data from RAM cache instead of Disk
        self.new_df, self.movies, self.movies2 = load_dataframes()
        
        # Pre-warm the cache for similarities
        load_similarity('tags', self.new_df)
        load_similarity('genres', self.new_df)
        load_similarity('keywords', self.new_df)
        load_similarity('tcast', self.new_df)
        load_similarity('tprduction_comp', self.new_df)