package com.firefly.modrinth;

import android.content.res.Resources;
import android.graphics.Bitmap;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewStub;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;
import androidx.recyclerview.widget.RecyclerView;

import com.kdt.SimpleArrayAdapter;

import net.kdt.pojavlaunch.firefly.PojavApplication;
import net.kdt.pojavlaunch.firefly.R;
import net.kdt.pojavlaunch.firefly.Tools;
import net.kdt.pojavlaunch.firefly.modloaders.modpacks.imagecache.ImageReceiver;
import net.kdt.pojavlaunch.firefly.modloaders.modpacks.imagecache.ModIconCache;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Future;

public class ModrinthAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    private static final int VIEW_TYPE_ITEM = 0;
    private static final int VIEW_TYPE_LOADING = 1;

    private final List<ModrinthModels.ProjectHit> mProjects = new ArrayList<>();
    private final ModIconCache mIconCache = new ModIconCache();
    private final float mCornerRadiusCache;
    private final SearchCallback mCallback;

    private boolean mIsLoading = false;
    private boolean mHasMore = true;
    private String mQuery = "";
    private String mProjectType = "";
    private String mMcVersion = "";
    private Future<?> mSearchFuture;

    public ModrinthAdapter(Resources resources, SearchCallback callback) {
        mCornerRadiusCache = resources.getDimension(R.dimen._1sdp) / 250;
        mCallback = callback;
    }

    public void setFilters(String query, String projectType, String mcVersion) {
        mQuery = query != null ? query : "";
        mProjectType = projectType != null ? projectType : "";
        mMcVersion = mcVersion != null ? mcVersion : "";
    }

    public void performSearch() {
        cancelSearch();
        mProjects.clear();
        mHasMore = true;
        mIsLoading = false;
        notifyDataSetChanged();
        loadMore();
    }

    public void cancelSearch() {
        if (mSearchFuture != null) {
            mSearchFuture.cancel(true);
            mSearchFuture = null;
        }
    }

    private void loadMore() {
        if (mIsLoading || !mHasMore) return;
        mIsLoading = true;
        notifyDataSetChanged();

        mSearchFuture = PojavApplication.sExecutorService.submit(() -> {
            ModrinthModels.SearchResult result = ModrinthApi.searchProjects(
                    mQuery, mProjectType, mMcVersion, mProjects.size(), 20);

            List<ModrinthModels.ProjectHit> newItems = result != null ? result.hits : null;
            boolean hasMore = result != null && (mProjects.size() + (newItems != null ? newItems.size() : 0)) < result.total;

            Tools.runOnUiThread(() -> {
                if (mSearchFuture == null || mSearchFuture.isCancelled()) return;

                if (newItems != null && !newItems.isEmpty()) {
                    mProjects.addAll(newItems);
                    mHasMore = hasMore;
                } else {
                    mHasMore = false;
                    if (mProjects.isEmpty() && mCallback != null) {
                        mCallback.onSearchError("搜索失败，请检查网络连接");
                    }
                }
                mIsLoading = false;
                notifyDataSetChanged();

                if (mCallback != null && mProjects.isEmpty() && (newItems == null || newItems.isEmpty())) {
                    mCallback.onSearchError("未找到相关项目");
                } else if (mCallback != null) {
                    mCallback.onSearchFinished();
                }
            });
        });
    }

    @Override
    public int getItemViewType(int position) {
        if (position < mProjects.size()) return VIEW_TYPE_ITEM;
        return VIEW_TYPE_LOADING;
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == VIEW_TYPE_ITEM) {
            View view = inflater.inflate(R.layout.item_modrinth_project, parent, false);
            return new ProjectViewHolder(view);
        } else {
            View view = inflater.inflate(R.layout.view_loading, parent, false);
            return new LoadingViewHolder(view);
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        if (getItemViewType(position) == VIEW_TYPE_ITEM) {
            ((ProjectViewHolder) holder).bind(mProjects.get(position));
        } else if (!mIsLoading) {
            loadMore();
        }
    }

    @Override
    public int getItemCount() {
        int count = mProjects.size();
        if (mHasMore || mIsLoading) count++;
        return count;
    }

    public class ProjectViewHolder extends RecyclerView.ViewHolder {
        private final ImageView mIconView;
        private final TextView mTitleView;
        private final TextView mDescView;
        private final TextView mStatsView;
        private final TextView mTypeView;
        private final ViewStub mDetailStub;
        private View mDetailLayout;
        private Spinner mVersionSpinner;
        private Button mInstallButton;
        private TextView mErrorView;
        private ProgressBar mDetailProgress;

        private ModrinthModels.ProjectHit mProject;
        private Future<?> mDetailFuture;
        private Bitmap mIconBitmap;
        private ImageReceiver mImageReceiver;

        public ProjectViewHolder(@NonNull View itemView) {
            super(itemView);
            mIconView = itemView.findViewById(R.id.modrinth_icon);
            mTitleView = itemView.findViewById(R.id.modrinth_title);
            mDescView = itemView.findViewById(R.id.modrinth_description);
            mStatsView = itemView.findViewById(R.id.modrinth_stats);
            mTypeView = itemView.findViewById(R.id.modrinth_type);
            mDetailStub = itemView.findViewById(R.id.modrinth_detail_stub);

            itemView.setOnClickListener(v -> toggleDetail());
        }

        public void bind(ModrinthModels.ProjectHit project) {
            if (mDetailFuture != null) {
                mDetailFuture.cancel(true);
                mDetailFuture = null;
            }
            if (mImageReceiver != null) {
                mIconCache.cancelImage(mImageReceiver);
            }
            if (mIconBitmap != null) {
                mIconView.setImageBitmap(null);
                mIconBitmap = null;
            }
            if (mDetailLayout != null) {
                mDetailLayout.setVisibility(View.GONE);
            }

            mProject = project;
            mTitleView.setText(project.title);
            mDescView.setText(project.description);
            mStatsView.setText(String.format("下载: %d | 关注: %d", project.downloads, project.follows));
            mTypeView.setText(getTypeLabel(project.projectType));

            mImageReceiver = bm -> {
                mImageReceiver = null;
                mIconBitmap = bm;
                if (bm != null) {
                    RoundedBitmapDrawable drawable = RoundedBitmapDrawableFactory.create(mIconView.getResources(), bm);
                    drawable.setCornerRadius(mCornerRadiusCache * bm.getHeight());
                    mIconView.setImageDrawable(drawable);
                } else {
                    mIconView.setImageResource(R.drawable.ic_modrinth);
                }
            };
            mIconCache.getImage(mImageReceiver, "modrinth_" + project.projectId, project.iconUrl);
        }

        private void toggleDetail() {
            if (mDetailLayout == null) {
                mDetailLayout = mDetailStub.inflate();
                mVersionSpinner = mDetailLayout.findViewById(R.id.modrinth_version_spinner);
                mInstallButton = mDetailLayout.findViewById(R.id.modrinth_install_button);
                mErrorView = mDetailLayout.findViewById(R.id.modrinth_detail_error);
                mDetailProgress = mDetailLayout.findViewById(R.id.modrinth_detail_progress);

                mInstallButton.setOnClickListener(v -> {
                    int pos = mVersionSpinner.getSelectedItemPosition();
                    if (pos >= 0 && mVersionSpinner.getAdapter() instanceof VersionAdapter) {
                        VersionAdapter adapter = (VersionAdapter) mVersionSpinner.getAdapter();
                        ModrinthModels.Version version = adapter.getVersion(pos);
                        if (version != null) {
                            mInstallButton.setEnabled(false);
                            ModrinthInstaller.install(v.getContext(), mProject, version, new ModrinthInstaller.InstallCallback() {
                                @Override
                                public void onSuccess(String message) {
                                    Tools.runOnUiThread(() -> mInstallButton.setEnabled(true));
                                }
                                @Override
                                public void onError(String message) {
                                    Tools.runOnUiThread(() -> mInstallButton.setEnabled(true));
                                }
                            });
                        }
                    }
                });
            }

            if (mDetailLayout.getVisibility() == View.VISIBLE) {
                mDetailLayout.setVisibility(View.GONE);
                return;
            }

            mDetailLayout.setVisibility(View.VISIBLE);
            if (mVersionSpinner.getAdapter() == null && mDetailFuture == null) {
                mDetailProgress.setVisibility(View.VISIBLE);
                mErrorView.setVisibility(View.GONE);
                mInstallButton.setEnabled(false);
                mVersionSpinner.setAdapter(new SimpleArrayAdapter<>(Collections.singletonList("加载中...")));

                mDetailFuture = PojavApplication.sExecutorService.submit(() -> {
                    List<String> gameVersions = mMcVersion != null && !mMcVersion.isEmpty()
                            ? Collections.singletonList(mMcVersion) : null;
                    List<ModrinthModels.Version> versions = ModrinthApi.getProjectVersions(mProject.projectId, null, gameVersions);

                    Tools.runOnUiThread(() -> {
                        if (mDetailFuture == null || mDetailFuture.isCancelled()) return;
                        mDetailFuture = null;
                        mDetailProgress.setVisibility(View.GONE);

                        if (versions == null || versions.isEmpty()) {
                            mErrorView.setVisibility(View.VISIBLE);
                            mErrorView.setText("未找到兼容版本");
                            mVersionSpinner.setAdapter(null);
                            mInstallButton.setEnabled(false);
                        } else {
                            mErrorView.setVisibility(View.GONE);
                            VersionAdapter adapter = new VersionAdapter(versions);
                            mVersionSpinner.setAdapter(adapter);
                            mInstallButton.setEnabled(true);
                        }
                    });
                });
            }
        }
    }

    private static class LoadingViewHolder extends RecyclerView.ViewHolder {
        LoadingViewHolder(View view) {
            super(view);
        }
    }

    private static class VersionAdapter extends SimpleArrayAdapter<String> {
        private final List<ModrinthModels.Version> mVersions;

        VersionAdapter(List<ModrinthModels.Version> versions) {
            super(new ArrayList<>());
            mVersions = versions;
            List<String> labels = new ArrayList<>();
            for (ModrinthModels.Version v : versions) {
                String label = v.name;
                if (v.gameVersions != null && !v.gameVersions.isEmpty()) {
                    label += " [" + String.join(", ", v.gameVersions) + "]";
                }
                labels.add(label);
            }
            setObjects(labels);
        }

        ModrinthModels.Version getVersion(int position) {
            if (position >= 0 && position < mVersions.size()) {
                return mVersions.get(position);
            }
            return null;
        }
    }

    private String getTypeLabel(String type) {
        switch (type) {
            case "mod": return "模组";
            case "resourcepack": return "资源包";
            case "shader": return "光影";
            default: return type;
        }
    }

    public interface SearchCallback {
        void onSearchFinished();
        void onSearchError(String message);
    }
}
