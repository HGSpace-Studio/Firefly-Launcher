package com.firefly.modrinth;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import net.kdt.pojavlaunch.firefly.R;
import net.kdt.pojavlaunch.firefly.Tools;
import net.kdt.pojavlaunch.firefly.profiles.VersionSelectorDialog;

public class ModrinthSearchFragment extends Fragment implements ModrinthAdapter.SearchCallback {

    public static final String TAG = "ModrinthSearchFragment";

    private EditText mSearchEditText;
    private Spinner mTypeSpinner;
    private ImageButton mFilterButton;
    private ImageButton mSearchButton;
    private RecyclerView mRecyclerView;
    private ProgressBar mProgressBar;
    private TextView mStatusText;
    private ModrinthAdapter mAdapter;

    private String mSelectedMcVersion = "";

    public ModrinthSearchFragment() {
        super(R.layout.fragment_modrinth_search);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        Bundle args = getArguments();
        if (args != null) {
            String mcVersion = args.getString("mc_version");
            if (mcVersion != null && !mcVersion.isEmpty()) {
                mSelectedMcVersion = mcVersion;
            }
        }

        mSearchEditText = view.findViewById(R.id.modrinth_search_edittext);
        mTypeSpinner = view.findViewById(R.id.modrinth_type_spinner);
        mFilterButton = view.findViewById(R.id.modrinth_filter_button);
        mSearchButton = view.findViewById(R.id.modrinth_search_button);
        mRecyclerView = view.findViewById(R.id.modrinth_recyclerview);
        mProgressBar = view.findViewById(R.id.modrinth_progressbar);
        mStatusText = view.findViewById(R.id.modrinth_status_text);

        ArrayAdapter<String> typeAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item,
                new String[]{"全部", "模组", "资源包", "光影"});
        typeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        mTypeSpinner.setAdapter(typeAdapter);

        mAdapter = new ModrinthAdapter(getResources(), this);
        mRecyclerView.setLayoutManager(new LinearLayoutManager(getContext()));
        mRecyclerView.setAdapter(mAdapter);

        mSearchEditText.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                startSearch();
                return true;
            }
            return false;
        });

        mSearchButton.setOnClickListener(v -> startSearch());
        mFilterButton.setOnClickListener(v -> showFilterDialog());

        startSearch();
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        mAdapter.cancelSearch();
    }

    private void startSearch() {
        hideKeyboard();
        mProgressBar.setVisibility(View.VISIBLE);
        mStatusText.setVisibility(View.GONE);

        String query = mSearchEditText.getText().toString().trim();
        String type = getSelectedProjectType();

        mAdapter.setFilters(query, type, mSelectedMcVersion);
        mAdapter.performSearch();
    }

    private String getSelectedProjectType() {
        int position = mTypeSpinner.getSelectedItemPosition();
        switch (position) {
            case 1: return "mod";
            case 2: return "resourcepack";
            case 3: return "shader";
            default: return "";
        }
    }

    private void showFilterDialog() {
        AlertDialog dialog = new AlertDialog.Builder(requireContext())
                .setView(R.layout.dialog_modrinth_filter)
                .create();

        dialog.setOnShowListener(dialogInterface -> {
            TextView versionText = dialog.findViewById(R.id.modrinth_selected_version);
            Button selectVersionButton = dialog.findViewById(R.id.modrinth_select_version_button);
            Button applyButton = dialog.findViewById(R.id.modrinth_apply_filter_button);
            Button clearButton = dialog.findViewById(R.id.modrinth_clear_version_button);

            if (versionText != null) {
                versionText.setText(mSelectedMcVersion.isEmpty() ? "未选择" : mSelectedMcVersion);
            }

            if (selectVersionButton != null) {
                selectVersionButton.setOnClickListener(v -> {
                    VersionSelectorDialog.open(requireContext(), true, (id, snapshot) -> {
                        mSelectedMcVersion = id;
                        if (versionText != null) versionText.setText(id);
                    });
                });
            }

            if (clearButton != null) {
                clearButton.setOnClickListener(v -> {
                    mSelectedMcVersion = "";
                    if (versionText != null) versionText.setText("未选择");
                });
            }

            if (applyButton != null) {
                applyButton.setOnClickListener(v -> {
                    dialog.dismiss();
                    startSearch();
                });
            }
        });

        dialog.show();
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) requireContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && getView() != null) {
            imm.hideSoftInputFromWindow(getView().getWindowToken(), 0);
        }
    }

    @Override
    public void onSearchFinished() {
        mProgressBar.setVisibility(View.GONE);
        mStatusText.setVisibility(View.GONE);
    }

    @Override
    public void onSearchError(String message) {
        mProgressBar.setVisibility(View.GONE);
        mStatusText.setVisibility(View.VISIBLE);
        mStatusText.setText(message);
    }
}
